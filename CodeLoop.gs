
function main() {
  /**
   * Get odds from the The Odds API and output the response to a spreadsheet.
   * Using Apps Script triggers, code can be invoked as frequently as every minute by default.
   * For more frequent updates, use this script along with the Apps Script minute trigger (see "Triggers" in the README).
   */

  const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0' // Get this from your browser
  const SHEET_NAME = 'Sheet1' // The name of the spreadsheet tab. Note all data in this sheet will be cleared with each request

  const API_KEY = 'YOUR_API_KEY' // Get an API key from https://the-odds-api.com/#get-access
  const SPORT_KEY = 'americanfootball_nfl' // For a list of sport keys, see https://the-odds-api.com/sports-odds-data/sports-apis.html
  const MARKETS = 'h2h,spreads' // Comma separated list of betting markets. Valid values are h2h, spreads & totals
  const REGIONS = 'us' // Comma separated list of bookmaker regions. Valid values are us, uk, eu and au
  const ODDS_FORMAT = 'american' // Valid values are american and decimal.
  const DATE_FORMAT = 'iso' // Valid values are unix and iso.

  const UPDATES_PER_MINUTE = 12 // Update data this many times per minute. For example if this is 12, data will refresh approximately every 60 / 12 = 5 seconds

  let data
  const ws = SpreadsheetApp.openByUrl(SPREADSHEET_URL).getSheetByName(SHEET_NAME)

  for (let x = 0; x < UPDATES_PER_MINUTE ; x++) {

    // Request the data from the API
    data = getOdds(API_KEY, SPORT_KEY, MARKETS, REGIONS, ODDS_FORMAT, DATE_FORMAT)

    // Prepare the spreadsheet for the data output
    // Note this clears any existing data on the spreadsheet
    ws.clearContents()

    // Output meta data starting in row 1, column 1
    ws.getRange(1, 1, data.metaData.length, data.metaData[0].length).setValues(data.metaData)

    // Output event data 2 rows below the meta data
    ws.getRange(data.metaData.length + 2, 1, data.eventData.length, data.eventData[0].length).setValues(data.eventData)
    SpreadsheetApp.flush()

    // Space out requests
    Utilities.sleep(60000 / UPDATES_PER_MINUTE)
  }
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
function getOdds(apiKey, sportKey, markets, regions, oddsFormat, dateFormat) {
  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?apiKey=${apiKey}&regions=${regions}&markets=${markets}&oddsFormat=${oddsFormat}&dateFormat=${dateFormat}`

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
      'market',
      'home_team',
      'home_odd',
      'home_point',
      'away_team',
      'away_odd',
      'away_point',
      'draw_odd',
    ]
  ]
  
  for (const event of events) {
    for (const bookmaker of event.bookmakers) {
      for (const market of bookmaker.markets) {
        let outcome_home = market.outcomes.filter(outcome => outcome.name === event.home_team)[0]
        let outcome_away = market.outcomes.filter(outcome => outcome.name === event.away_team)[0]
        let outcome_draw = market.outcomes.filter(outcome => outcome.name === 'Draw')[0] ?? {}
        rows.push([
          event.id,
          event.commence_time,
          bookmaker.key,
          bookmaker.last_update,
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
