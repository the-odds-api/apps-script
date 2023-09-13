function getOdds() {
  /**
   * Query historical odds from the The Odds API and output the response to Google Sheets.
   * 
   * If the spreadsheet has existing data, newly queried data will be appended to the next available row.
   * 
   * Historical data is only available for paid subscriptions.
   * 
   * The usage quota cost of each historical timestamp query is calculated as: 10 x [number of markets] x [number of regions]
   * More info: https://the-odds-api.com/liveapi/guides/v4/#usage-quota-costs-3
   * 
   * Depending on the specified FROM_DATE, TO_DATE and INTERVAL_MINS, the volume of data can be large. Google Sheets has a limit of 10 million cells.
   * 
   * This script will currently run for a maximum of 6 minutes at a time [see Apps Script service quotas](https://developers.google.com/apps-script/guides/services/quotas#current_limitations)
   * If the timeout is reached, you may need to trigger this script multiple times for smaller time ranges.
   * 
   * Note this code does not handle futures (outrights) markets at this time.
   */

  const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/abc123456789/edit#gid=0' // Get this from your browser
  const SHEET_NAME = 'Sheet1' // The name of the spreadsheet tab. Note all data in this sheet will be cleared with each request
  const API_KEY = 'YOUR_API_KEY' // Get an API key from https://the-odds-api.com/#get-access

  const SPORT_KEY = 'baseball_mlb' // For a list of sport keys, see https://the-odds-api.com/sports-odds-data/sports-apis.html
  const MARKETS = 'h2h,spreads,totals' // Comma separated list of betting markets. Valid values are h2h, spreads & totals
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
      'last_update',
      'home_team',
      'away_team',
      'market',
      'label_1',
      'odd_1',
      'point_1',
      'label_2',
      'odd_2',
      'point_2',
      'odd_draw',
  ]

  const ws = SpreadsheetApp.openByUrl(SPREADSHEET_URL).getSheetByName(SHEET_NAME)
  let data
  let current_date = new Date(TO_DATE).getTime()
  let output_row = ws.getLastRow() + 1
  let formattedResponse

  if (output_row === 1) {
    // Output headers
    ws.getRange(3, 1, 1, headers.length).setValues([headers])

    // 1st 2 rows are for meta data, headers are on the 3rd row
    output_row = 4
  }

  while (current_date > (new Date(FROM_DATE)).getTime()) {

    // Request the data from the API
    data = fetchOdds(API_KEY, SPORT_KEY, REGIONS, BOOKMAKERS, MARKETS, ODDS_FORMAT, Utilities.formatDate(new Date(current_date), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'"))

    // Output meta data starting in row 1, column 1
    ws.getRange(1, 1, 2, data.metaData[0].length).setValues(data.metaData)

    // Output event data
    formattedResponse = formatEventOutput(data.responseContent)
    if (formattedResponse.length > 0) {
      ws.getRange(output_row, 1, formattedResponse.length, formattedResponse[0].length).setValues(formattedResponse)
      SpreadsheetApp.flush()
    }

    if (data.responseContent.previous_timestamp === null) {
      // Earlier historical data is not available
      break;
    }

    current_date = Math.min(current_date - (INTERVAL_MINS * 60 * 1000), (new Date(data.responseContent.previous_timestamp)).getTime())
    output_row = output_row + formattedResponse.length
  }
}

function fetchOdds(apiKey, sportKey, regions, bookmakers, markets, oddsFormat, timestamp) {
  const bookmakersParam = bookmakers ? `bookmakers=${bookmakers}` : `regions=${regions}`

  const url = `https://api.the-odds-api.com/v4/historical/sports/${sportKey}/odds?apiKey=${apiKey}&${bookmakersParam}&markets=${markets}&oddsFormat=${oddsFormat}&date=${timestamp}`

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
  let outcome_home
  let outcome_away
  let outcome_draw
  for (const event of response.data) {
    for (const bookmaker of event.bookmakers) {
      for (const market of bookmaker.markets) {
        if (market.key === 'totals') {
          outcome_home = market.outcomes.filter(outcome => outcome.name === 'Over')[0]
          outcome_away = market.outcomes.filter(outcome => outcome.name === 'Under')[0]
          outcome_draw = {}
        } else {
          outcome_home = market.outcomes.filter(outcome => outcome.name === event.home_team)[0]
          outcome_away = market.outcomes.filter(outcome => outcome.name === event.away_team)[0]
          outcome_draw = market.outcomes.filter(outcome => outcome.name === 'Draw')[0] ?? {}
        }

        rows.push([
          response.timestamp,
          event.id,
          event.commence_time,
          bookmaker.key,
          bookmaker.last_update,
          event.home_team,
          event.away_team,
          market.key,
          outcome_home.name,
          outcome_home.price,
          outcome_home?.point,
          outcome_away.name,
          outcome_away.price,
          outcome_away?.point,
          outcome_draw?.price,
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