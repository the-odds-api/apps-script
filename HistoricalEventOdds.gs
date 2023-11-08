function getOdds() {
  /**
   * Query historical odds from the The Odds API and output the response to Google Sheets.
   * 
   * This script will query historical data at timestamps between the date range given (see FROM_DATE, TO_DATE and INTERVAL_MINS).
   * Odds are queried one game at a time for a given sport.
   * 
   * This script is compatible with both featured and non-featured markets (see https://the-odds-api.com/sports-odds-data/betting-markets.html)
   * Historical data for non-featured markets are available from 2023-05-03.
   * 
   * The maximum usage cost of each API call at a given timestamp is 10 x [number of markets] x [number of bookmaker regions] x [number of games] + 1
   * It can be lower if some markets are not available at the specified timestamp.
   * The +1 component comes from an initial query to list games at the given timestamp.
   * 
   * If the spreadsheet has existing data, newly queried data will be appended to the next available row.
   * 
   * Historical data is only available for paid subscriptions.
   * 
   * Depending on the specified FROM_DATE, TO_DATE and INTERVAL_MINS, the volume of data can be large. Google Sheets has a limit of 10 million cells.
   * 
   * This script will currently run for a maximum of 6 minutes at a time [see Apps Script service quotas](https://developers.google.com/apps-script/guides/services/quotas#current_limitations)
   * If the timeout is reached, you may need to trigger this script multiple times for smaller time ranges.
   * 
   */

  const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/abc123456789/edit#gid=0' // Get this from your browser
  const SHEET_NAME = 'Sheet1' // The name of the spreadsheet tab. Note all data in this sheet will be cleared with each request
  const API_KEY = 'YOUR_API_KEY' // Get an API key from https://the-odds-api.com/#get-access

  const SPORT_KEY = 'baseball_mlb' // For a list of sport keys, see https://the-odds-api.com/sports-odds-data/sports-apis.html
  const MARKETS = 'h2h,spreads,totals' // Comma separated list of betting markets. For market keys, see https://the-odds-api.com/sports-odds-data/betting-markets.html
  const REGIONS = 'us' // Comma separated list of bookmaker regions. Valid values are us, uk, eu and au
  const BOOKMAKERS = '' // Optional - if specified, it overrides REGIONS. A list of comma separated bookmakers from any region. For example: draftkings,pinnacle See all bookmakers at https://the-odds-api.com/sports-odds-data/bookmaker-apis.html
  const ODDS_FORMAT = 'american' // Valid values are american and decimal.

  const FROM_DATE = '2023-09-10T00:00:00Z'
  const TO_DATE = '2023-09-10T12:00:00Z'
  const INTERVAL_MINS = 60 // The interval between historical snapshots (this number should be 5 or more)

const headers = [
      'timestamp',
      'id',
      'commence_time',
      'bookmaker',
      'home_team',
      'away_team',
      'market',
      'last_update',
      'label',
      'description',
      'price',
      'point',
  ]

  const ws = SpreadsheetApp.openByUrl(SPREADSHEET_URL).getSheetByName(SHEET_NAME)
  let data
  let formattedDate
  let currentDate = new Date(TO_DATE).getTime()
  let outputRow = ws.getLastRow() + 1
  let formattedResponse

  if (outputRow === 1) {
    // Output headers
    ws.getRange(3, 1, 1, headers.length).setValues([headers])

    // 1st 2 rows are for meta data, headers are on the 3rd row
    outputRow = 4
  }

  while (currentDate > (new Date(FROM_DATE)).getTime()) {
    formattedDate = Utilities.formatDate(new Date(currentDate), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'")

    for (const event of fetchEvents(API_KEY, SPORT_KEY, formattedDate).responseContent.data) {
      data = fetchEventOdds(API_KEY, SPORT_KEY, event.id, REGIONS, BOOKMAKERS, MARKETS, ODDS_FORMAT, formattedDate)

      // Output meta data starting in row 1, column 1
      ws.getRange(1, 1, 2, data.metaData[0].length).setValues(data.metaData)

      // Output event data
      formattedResponse = formatEventOutput(data.responseContent)
      if (formattedResponse.length > 0) {
        ws.getRange(outputRow, 1, formattedResponse.length, formattedResponse[0].length).setValues(formattedResponse)
        SpreadsheetApp.flush()
      }

      currentDate = Math.min(currentDate - (INTERVAL_MINS * 60 * 1000), (new Date(data.responseContent.previous_timestamp)).getTime())
      outputRow = outputRow + formattedResponse.length

      if (data.responseContent.previous_timestamp === null) {
        // Earlier historical data is not available
        return;
      }
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

function fetchEventOdds(apiKey, sportKey, eventId, regions, bookmakers, markets, oddsFormat, timestamp) {
  const bookmakersParam = bookmakers ? `bookmakers=${bookmakers}` : `regions=${regions}`

  const url = `https://api.the-odds-api.com/v4/historical/sports/${sportKey}/events/${eventId}/odds?apiKey=${apiKey}&${bookmakersParam}&markets=${markets}&oddsFormat=${oddsFormat}&date=${timestamp}`

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
          event.home_team,
          event.away_team,
          market.key,
          market.last_update,
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