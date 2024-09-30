function getClosingLinesEvent() {
  /**
   * Query historical closing lines from the The Odds API and output the response to Google Sheets.
   *
   * This script will work with any market. If you only need featured markets (h2h, spreads, totals), it is more cost-effective use ClosingLinesFeaturedMarkets.gs
   * 
   * This script works by first finding the commence times of each game within the specified time range, accounting for possible delays. This makes use of the historical events endpoint.
   * 
   * Once a list of each event id and the final commence time is found, odds are queried for each event, using the event's commence time as the timestamp.
   * 
   * Historical data is only available for paid subscriptions.
   * 
   * The usage quota cost of each historical timestamp query is calculated as: 10 x [number of markets] x [number of regions]
   * More info: https://the-odds-api.com/liveapi/guides/v4/
   * 
   * Depending on the specified FROM_DATE, TO_DATE and INTERVAL_MINS, the volume of data can be large. Google Sheets has a limit of 10 million cells.
   * 
   * This script will currently run for a maximum of 6 minutes at a time [see Apps Script service quotas](https://developers.google.com/apps-script/guides/services/quotas#current_limitations)
   * If the timeout is reached, you may need to trigger this script multiple times for smaller time ranges.
   * 
   * If the spreadsheet has existing data, newly queried data will be appended to the next available row.
   * 
   */

  const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/123' // Get this from your browser
  const SHEET_NAME = 'Sheet1' // The name of the spreadsheet tab. Note all data in this sheet will be cleared with each request
  const API_KEY = 'YOUR_API_KEY' // Get an API key from https://the-odds-api.com/#get-access

  const SPORT_KEY = 'baseball_mlb' // For a list of sport keys, see https://the-odds-api.com/sports-odds-data/sports-apis.html
  const MARKETS = 'batter_home_runs' // Comma separated list of betting markets. Valid values are h2h, spreads & totals
  const REGIONS = 'us' // Comma separated list of bookmaker regions. Valid values are us, us2, uk, eu and au
  const BOOKMAKERS = '' // Optional - if specified, it overrides REGIONS. A list of comma separated bookmakers from any region. For example: draftkings,pinnacle See all bookmakers at https://the-odds-api.com/sports-odds-data/bookmaker-apis.html
  const ODDS_FORMAT = 'american' // Valid values are american and decimal.

  const FROM_DATE = '2024-04-03T00:00:00Z'
  const TO_DATE = '2024-04-04T00:00:00Z'
  const INTERVAL_MINS = 60*24 // The interval between historical snapshots (this number should be 5 or more)

  const headers = [
      'timestamp',
      'id',
      'commence_time',
      'bookmaker',
      'last_update',
      'home_team',
      'away_team',
      'market',
      'name',
      'description',
      'price',
      'point',
  ]

  const ws = SpreadsheetApp.openByUrl(SPREADSHEET_URL).getSheetByName(SHEET_NAME)
  
  let eventCommenceTimes = {}
  let eventsResponse, formattedTimestamp
  let currentUnixTimestamp = new Date(FROM_DATE).getTime()
  while (currentUnixTimestamp <= (new Date(TO_DATE)).getTime()) {
    formattedTimestamp = Utilities.formatDate(new Date(currentUnixTimestamp), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'")
    Logger.log(`Gathering games ${formattedTimestamp}`)
    eventsResponse = fetchEvents(API_KEY, SPORT_KEY, formattedTimestamp)
    eventCommenceTimes = {...eventCommenceTimes,...extractCommenceTimes(eventsResponse.responseContent.data, FROM_DATE, TO_DATE)}
    currentUnixTimestamp = Math.max(currentUnixTimestamp + (INTERVAL_MINS * 60 * 1000), (new Date(eventsResponse.responseContent.next_timestamp)).getTime())
  }

  // Refine commence times, in case of event delays
  let currentCommenceTime = Object.values(eventCommenceTimes)[0]
  while (currentCommenceTime !== null) {
    Logger.log(`Refining commence times ${currentCommenceTime}`)
    eventsResponse = fetchEvents(API_KEY, SPORT_KEY, currentCommenceTime)
    eventCommenceTimes = {...eventCommenceTimes,...extractCommenceTimes(eventsResponse.responseContent.data, FROM_DATE, TO_DATE)}
    currentCommenceTime = getNextCommenceTime(Object.values(eventCommenceTimes), currentCommenceTime)
  }

  // Group eventIds by commence time
  const groupedEvents = {}
  for (const commenceTime of new Set(Object.values(eventCommenceTimes))) {
    groupedEvents[commenceTime] = getKeyByValue(eventCommenceTimes, commenceTime)
  }
  
  let output_row = ws.getLastRow() + 1
  if (output_row === 1) {
    // Output headers
    ws.getRange(3, 1, 1, headers.length).setValues([headers])

    // 1st 2 rows are for meta data, headers are on the 3rd row
    output_row = 4
  }
  
  // iterate on commence time keys, query on t, filter events, output all
  let oddsResponse
  let formattedResponse
  for (const commenceTime in groupedEvents) {
    Logger.log(`Querying closing lines ${commenceTime}, ${groupedEvents[commenceTime]}`)
    for (const eventId of groupedEvents[commenceTime]) {
      oddsResponse = fetchEventOdds(API_KEY, SPORT_KEY, REGIONS, BOOKMAKERS, MARKETS, ODDS_FORMAT, commenceTime, eventId)
      if (oddsResponse.responseCode === 404) {
        Logger.log(`event id ${eventId} at ${commenceTime} was not found`)
        continue
      }
      formattedResponse = formatEventOutput(oddsResponse.responseContent)
      if (formattedResponse.length > 0) {
        ws.getRange(output_row, 1, formattedResponse.length, formattedResponse[0].length).setValues(formattedResponse)
        SpreadsheetApp.flush()
      }
      output_row = output_row + formattedResponse.length
    }
  }
}

function fetchEvents(apiKey, sportKey, timestamp) {
  const url = `https://api.the-odds-api.com/v4/historical/sports/${sportKey}/events?apiKey=${apiKey}&date=${timestamp}`

  const response = UrlFetchApp.fetch(url, {
    headers: {
      'content-type': 'application/json'
    },
  })

  return {
    metaData: formatResponseMetaData(response.getHeaders()),
    responseContent: JSON.parse(response.getContentText()),
  }
}

function fetchEventOdds(apiKey, sportKey, regions, bookmakers, markets, oddsFormat, timestamp, eventId) {
  const bookmakersParam = bookmakers ? `bookmakers=${bookmakers}` : `regions=${regions}`
  
  const url = `https://api.the-odds-api.com/v4/historical/sports/${sportKey}/events/${eventId}/odds?apiKey=${apiKey}&${bookmakersParam}&markets=${markets}&oddsFormat=${oddsFormat}&date=${timestamp}`

  const response = UrlFetchApp.fetch(url, {
    headers: {
      'content-type': 'application/json'
    },
    muteHttpExceptions: true,
  })

  return {
    responseCode: response.getResponseCode(),
    metaData: formatResponseMetaData(response.getHeaders()),
    responseContent: JSON.parse(response.getContentText()),
  }
}

function formatEventOutput(response) {
  /**
   * Restructure the JSON response into a 2D array, suitable for outputting to a spreadsheet
   */
  const rows = []
  const event = response.data  
  for (const bookmaker of event.bookmakers) {
    for (const market of bookmaker.markets) {
      for (const outcome of market.outcomes) {
        rows.push([
          response.timestamp,
          event.id,
          event.commence_time,
          bookmaker.key,
          bookmaker.last_update,
          event.home_team,
          event.away_team,
          market.key,
          outcome.name,
          outcome?.description,
          outcome.price,
          outcome?.point,
        ])
      }

    }
  }
  

  return rows
}
  
function formatResponseMetaData(headers) {
  return [
    ['Requests Used', headers['x-requests-used']],
    ['Requests Remaining', headers['x-requests-remaining']],
  ]
}

function extractCommenceTimes(events, fromDate, toDate) {
  const eventCommenceTimes = {}
  events.forEach(event => {
    if (event.commence_time < fromDate || event.commence_time > toDate) {
      // Event start time falls outside the requested range
      return true
    }
    eventCommenceTimes[event.id] = event.commence_time
  })
  return eventCommenceTimes
}

function getNextCommenceTime(commenceTimes, currentCommenceTime) {
  // assumes commenceTimes ordered asc
  for (const commenceTime of commenceTimes) {
    if (commenceTime <= currentCommenceTime) {
      continue
    }
    return commenceTime
  }
  return null
}

function getKeyByValue(d, value) {
  return Object.keys(d).filter((key) => d[key] === value)
}