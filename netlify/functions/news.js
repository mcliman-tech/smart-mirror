const FEEDS = {
  casteddu: 'https://www.castedduonline.it/feed/',
  sardiniapost: 'https://www.sardiniapost.it/feed/',
  'ansa-sardegna': 'https://www.ansa.it/sardegna/notizie/sardegna_rss.xml',
  unionesarda: 'https://www.unionesarda.it/sitemaps/rss',
  breaking: 'https://www.adnkronos.com/RSS_Ultimora.xml',
  frontpage: 'https://www.adnkronos.com/RSS_PrimaPagina.xml',
};

exports.handler = async event => {
  const feed = event.queryStringParameters?.feed;
  const url = FEEDS[feed];
  if (!url) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'Feed non valido.' }),
    };
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'SmartMirror/1.0 RSS reader' },
    });
    if (!response.ok) {
      console.error(`Adnkronos RSS returned HTTP ${response.status} for ${feed}`);
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ error: 'Il feed notizie non è raggiungibile.' }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
      body: await response.text(),
    };
  } catch (error) {
    console.error(`Unable to retrieve Adnkronos RSS for ${feed}:`, error);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'Errore durante il recupero del feed notizie.' }),
    };
  }
};
