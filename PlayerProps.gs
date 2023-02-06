function getOdds() {
    /**
     * Get player props from the The Odds API and output the response to a spreadsheet.
     * This script loops live and upcoming games for a given sport (see SPORT_KEY). For each game, it queries odds for specified betting markets (see MARKETS)
     * and outputs the aggregated result to a single spreadsheet.
     */
  
    const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0' // Get this from your browser
    const SHEET_NAME = 'Sheet1' // The name of the spreadsheet tab. Note all data in this sheet will be cleared with each request
  
    const API_KEY = 'YOUR_API_KEY' // Get an API key from https://the-odds-api.com/#get-access
    const SPORT_KEY = 'americanfootball_nfl' // For a list of sport keys, see https://the-odds-api.com/sports-odds-data/sports-apis.html
    const MARKETS = 'player_pass_tds,player_pass_yds,player_pass_completions' // Comma separated list of betting markets. See all markets at https://the-odds-api.com/sports-odds-data/betting-markets.html
    const REGIONS = 'us' // Comma separated list of bookmaker regions. Valid values are us, uk, eu and au
    const BOOKMAKERS = '' // Optional - if specified, it overrides REGIONS. A list of comma separated bookmakers from any region. For example: draftkings,pinnacle See all bookmakers at https://the-odds-api.com/sports-odds-data/bookmaker-apis.html
    const ODDS_FORMAT = 'american' // Valid values are american and decimal.
    const DATE_FORMAT = 'iso' // Valid values are unix and iso.
  
    // Request main markets data from the API
    const events = fetchEvents(API_KEY, SPORT_KEY, 'h2h', REGIONS, BOOKMAKERS, ODDS_FORMAT, DATE_FORMAT)
  
    if (events.length === 0) {
      Logger.log('No events found')
      return
    }
  
    let output = []
    let marketResponse
    for (const event of events) {
      // Concatenate output for all games
      marketResponse = fetchEventMarkets(API_KEY, SPORT_KEY, MARKETS, REGIONS, BOOKMAKERS, ODDS_FORMAT, DATE_FORMAT, event.id)
      output = output.concat(marketResponse.eventData)
    }
  
    // Prepare the spreadsheet for the data output
    // Note this clears any existing data on the spreadsheet
    const ws = SpreadsheetApp.openByUrl(SPREADSHEET_URL).getSheetByName(SHEET_NAME)
    ws.clearContents()
  
    // Output meta data starting in row 1, column 1
    ws.getRange(1, 1, marketResponse.metaData.length, marketResponse.metaData[0].length).setValues(marketResponse.metaData)
  
    // Output event data 2 rows below the meta data
    ws.getRange(marketResponse.metaData.length + 2, 1, output.length, output[0].length).setValues(output)
  }
  
  function fetchEvents(apiKey, sportKey, markets, regions, bookmakers, oddsFormat, dateFormat) {
    const bookmakersParam = bookmakers ? `bookmakers=${bookmakers}` : `regions=${regions}`
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?apiKey=${apiKey}&${bookmakersParam}&markets=${markets}&oddsFormat=${oddsFormat}&dateFormat=${dateFormat}`
  
    const response = UrlFetchApp.fetch(url, {
      headers: {
        'content-type': 'application/json'
      },
    })  
    
    return JSON.parse(response.getContentText())
  }
  
  function fetchEventMarkets(apiKey, sportKey, markets, regions, bookmakers, oddsFormat, dateFormat, eventId) {
    const bookmakersParam = bookmakers ? `bookmakers=${bookmakers}` : `regions=${regions}`
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/events/${eventId}/odds?apiKey=${apiKey}&${bookmakersParam}&markets=${markets}&oddsFormat=${oddsFormat}&dateFormat=${dateFormat}`
  
    const response = UrlFetchApp.fetch(url, {
      headers: {
        'content-type': 'application/json'
      },
    })  
    
    return {
      metaData: formatResponseMetaData(response.getHeaders()),
      eventData: formatEventOutput(JSON.parse(response.getContentText())),
    }
  }
  
  function formatEventOutput(event) {
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
        'label',
        'description',
        'price',
        'point',
      ]
    ]
    
    for (const bookmaker of event.bookmakers) {
      for (const market of bookmaker.markets) {
        for (const outcome of market.outcomes) {
          rows.push([
            event.id,
            event.commence_time,
            bookmaker.key,
            market.last_update,
            event.home_team,
            event.away_team,
            market.key,
            outcome.name,
            outcome.description,
            outcome.price,
            outcome.point,
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
  