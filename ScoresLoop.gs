
function getScores() {
  /**
   * Get scores from the The Odds API and output the response to a spreadsheet.
   */

  const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0' // Get this from your browser
  const SHEET_NAME = 'Scores' // The name of the spreadsheet tab. Note all data in this sheet will be cleared with each request

  const API_KEY = 'YOUR_API_KEY' // Get an API key from https://the-odds-api.com/#get-access
  const SPORT_KEY = 'americanfootball_nfl' // For a list of sport keys, see https://the-odds-api.com/sports-odds-data/sports-apis.html
  const DAYS_FROM = 1 // Return games from this many days in the past. Valid values are 0 - 3. If 0, only live games will be returned.
  const DATE_FORMAT = 'iso' // Valid values are unix and iso.

  const UPDATES_PER_MINUTE = 2 // Update data this many times per minute. For example if this is 2, data will refresh approximately every 60 / 2 = 30 seconds
  
  let data
  const ws = SpreadsheetApp.openByUrl(SPREADSHEET_URL).getSheetByName(SHEET_NAME)

  for (let x = 0; x < UPDATES_PER_MINUTE ; x++) {
  
    // Request the data from the API
    data = fetchScores(API_KEY, SPORT_KEY, DAYS_FROM, DATE_FORMAT)

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
 * @param {int} daysFrom Return games from this many days in the past (includes completed games). Valid values are 0 - 3. If 0, only live games will be returned.
 * @param {string} dateFormat Valid values are unix and iso.
 * @return {object} A dictionary containing keys for metaData and eventData, each with a value as a 2D array (tabular) for easy output to a spreadsheet. If the request fails, event_data will be null.
 */
function fetchScores(apiKey, sportKey, daysFrom, dateFormat) {
    
    let url = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores?apiKey=${apiKey}&dateFormat=${dateFormat}`
    if (daysFrom !== 0) {
        url += `&daysFrom=${daysFrom}`
    }

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
      'completed',
      'last_update',
      'home_team',
      'home_score',
      'away_team',
      'away_score',
    ]
  ]
  
  for (const event of events) {
    let home_score = event.scores ? event.scores.filter(outcome => outcome.name === event.home_team)[0].score : null
    let away_score = event.scores ? event.scores.filter(outcome => outcome.name === event.away_team)[0].score : null
    
    rows.push([
        event.id,
        event.commence_time,
        event.completed,
        event.last_update,
        event.home_team,
        home_score,
        event.away_team,
        away_score,
    ])
  }

  return rows
}

function formatResponseMetaData(headers) {
  return [
    ['Requests Used', headers['x-requests-used']],
    ['Requests Remaining', headers['x-requests-remaining']],
  ]
}
