
function getOdds() {
  /**
   * Get odds from the The Odds API and output the response to a spreadsheet.
   * 
   * Note this code does not handle futures (outrights) markets at this time.
   */

  const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0' // Get this from your browser
  const SHEET_NAME = 'Sheet1' // The name of the spreadsheet tab. Note all data in this sheet will be cleared with each request

  const API_KEY = 'YOUR_API_KEY' // Get an API key from https://the-odds-api.com/#get-access
  const SPORT_KEY = 'americanfootball_nfl' // For a list of sport keys, see https://the-odds-api.com/sports-odds-data/sports-apis.html
  const MARKETS = 'h2h,spreads' // Comma separated list of betting markets. Valid values are h2h, spreads & totals
  const REGIONS = 'us' // Comma separated list of bookmaker regions. Valid values are us, uk, eu and au
  const BOOKMAKERS = '' // Optional - if specified, it overrides REGIONS. A list of comma separated bookmakers from any region. For example: draftkings,pinnacle See all bookmakers at https://the-odds-api.com/sports-odds-data/bookmaker-apis.html
  const ODDS_FORMAT = 'american' // Valid values are american and decimal.
  const DATE_FORMAT = 'iso' // Valid values are unix and iso.

  // Request the data from the API
  const data = fetchOdds(API_KEY, SPORT_KEY, MARKETS, REGIONS, BOOKMAKERS, ODDS_FORMAT, DATE_FORMAT)

  // Prepare the spreadsheet for the data output
  // Note this clears any existing data on the spreadsheet
  const ws = SpreadsheetApp.openByUrl(SPREADSHEET_URL).getSheetByName(SHEET_NAME)
  ws.clearContents()

  // Output meta data starting in row 1, column 1
  ws.getRange(1, 1, data.metaData.length, data.metaData[0].length).setValues(data.metaData)

  // Output event data 2 rows below the meta data
  ws.getRange(data.metaData.length + 2, 1, data.eventData.length, data.eventData[0].length).setValues(data.eventData)
}


/**
 * Calls v4 of The Odds API and returns odds data in a tabular structure
 * For details, see https://the-odds-api.com/liveapi/guides/v4/#parameters-2
 *
 * @param {string} apiKey Get an API key from https://the-odds-api.com/#get-access
 * @param {string} sportKey For a list of sport keys, see https://the-odds-api.com/sports-odds-data/sports-apis.html
 * @param {string} markets Comma separated list of betting markets. Valid values are h2h, spreads & totals
 * @param {string} regions Comma separated list of bookmaker regions. Valid values are us, uk, eu and au
 * @param {string} oddsFormat Valid values are american and decimal.
 * @param {string} dateFormat Valid values are unix and iso.
 * @return {object} A dictionary containing keys for metaData and eventData, each with a value as a 2D array (tabular) for easy output to a spreadsheet. If the request fails, event_data will be null.
 */
function fetchOdds(apiKey, sportKey, markets, regions, bookmakers, oddsFormat, dateFormat) {
  const bookmakersParam = bookmakers ? `bookmakers=${bookmakers}` : `regions=${regions}`
  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?apiKey=${apiKey}&${bookmakersParam}&markets=${markets}&oddsFormat=${oddsFormat}&dateFormat=${dateFormat}`

  const response = UrlFetchApp.fetch(url, {
    headers: {
      'content-type': 'application/json'
    },
  })  
  
  return {
    metaData: formatResponseMetaData(response.getHeaders()),
    eventData: formatEvents(JSON.parse(response.getContentText())),
  }

}

function formatEvents(events) {
  /**
   * Restructure the JSON response into a 2D array, suitable for outputting to a spreadsheet
   */
  const rows = [
    [
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
  ]

  let outcome_home
  let outcome_away
  let outcome_draw

  for (const event of events) {
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
