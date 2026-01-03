/** WebTeizle Sora Module
 * Türkçe dublaj ve altyazılı film izleme modülü
 * Base URL: https://webteizle3.xyz
 */

const BASE_URL = "https://webteizle3.xyz";

// ============================================================================
// SEARCH RESULTS
// ============================================================================

/**
 * Searches for movies based on a keyword.
 * @param {string} keyword - The search keyword.
 * @returns {Promise<string>} - A JSON string of search results.
 */
async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);

        const response = await soraFetch(`${BASE_URL}/ajax/arama.asp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': `${BASE_URL}/`,
                'Origin': BASE_URL,
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            body: `q=${encodedKeyword}`
        });

        if (!response || response.status === 0) {
            console.log('Search: No response');
            return JSON.stringify([]);
        }

        const data = await response.json();

        if (!data || data.status !== "OK" || !data.results) {
            console.log('Search: Invalid data');
            return JSON.stringify([]);
        }

        const results = [];

        // Process filmler (movies)
        if (data.results.filmler && data.results.filmler.results) {
            data.results.filmler.results.forEach(item => {
                const slug = extractSlugFromUrl(item.url);
                if (slug) {
                    results.push({
                        title: cleanTitle(item.title),
                        image: normalizeImageUrl(item.image),
                        href: `${BASE_URL}/hakkinda/${slug}`
                    });
                }
            });
        }

        // Process diziler (series) - optional
        if (data.results.diziler && data.results.diziler.results) {
            data.results.diziler.results.forEach(item => {
                const slug = extractSlugFromUrl(item.url);
                if (slug) {
                    results.push({
                        title: cleanTitle(item.title),
                        image: normalizeImageUrl(item.image),
                        href: `${BASE_URL}/hakkinda/${slug}`
                    });
                }
            });
        }

        return JSON.stringify(results);

    } catch (error) {
        console.log('Search error: ' + error);
        return JSON.stringify([]);
    }
}

// ============================================================================
// EXTRACT DETAILS
// ============================================================================

/**
 * Extracts details of a movie from its page URL.
 * @param {string} url - The URL of the movie page.
 * @returns {Promise<string>} - A JSON string of the movie details.
 */
async function extractDetails(url) {
    try {
        const slug = extractSlugFromUrl(url);
        if (!slug) {
            return JSON.stringify({
                description: 'Film bulunamadı',
                aliases: '',
                airdate: ''
            });
        }

        const response = await soraFetch(`${BASE_URL}/_ajaxweb/sol/hakkinda/${slug}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': `${BASE_URL}/hakkinda/${slug}`,
                'Origin': BASE_URL,
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
                'Accept': 'text/html, */*; q=0.01',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });

        if (!response || response.status === 0) {
            return JSON.stringify({
                description: 'Detaylar yüklenemedi',
                aliases: '',
                airdate: ''
            });
        }

        const responseText = await response.text();

        if (!responseText) {
            return JSON.stringify({
                description: 'Detaylar yüklenemedi',
                aliases: '',
                airdate: ''
            });
        }

        // Parse HTML for details
        const description = extractFromHtml(responseText, /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i) || 'Açıklama bulunamadı';

        // Extract year from title or page
        const yearMatch = responseText.match(/\((\d{4})\)/);
        const year = yearMatch ? yearMatch[1] : '';

        // Extract genres
        const genreMatches = responseText.match(/filtre\?tur=[^"']+["'][^>]*>([^<]+)/gi);
        let genres = '';
        if (genreMatches) {
            const genreList = genreMatches.map(m => {
                const match = m.match(/>([^<]+)$/);
                return match ? match[1].trim() : '';
            }).filter(g => g);
            genres = genreList.join(', ');
        }

        // Extract duration
        const durationMatch = responseText.match(/(\d+)\s*(dakika|min)/i);
        const duration = durationMatch ? durationMatch[1] + ' dakika' : '';

        // Extract IMDB rating
        const imdbMatch = responseText.match(/imdb[^>]*>[\s\S]*?(\d+[,\.]\d+)/i);
        const imdb = imdbMatch ? 'IMDB: ' + imdbMatch[1] : '';

        return JSON.stringify([{
            description: cleanHtml(description),
            aliases: [genres, duration].filter(x => x).join(' | '),
            airdate: [year ? 'Yıl: ' + year : '', imdb].filter(x => x).join(' | ')
        }]);

    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify([{
            description: 'Hata oluştu',
            aliases: '',
            airdate: ''
        }]);
    }
}

// ============================================================================
// EXTRACT EPISODES
// ============================================================================

/**
 * Extracts episodes/watch options for a movie.
 * For movies, this returns watch links (dublaj/altyazi).
 * @param {string} url - The URL of the movie page.
 * @returns {Promise<string>} - A JSON string of the episodes.
 */
async function extractEpisodes(url) {
    try {
        const slug = extractSlugFromUrl(url);
        if (!slug) {
            return JSON.stringify([]);
        }

        const response = await soraFetch(`${BASE_URL}/_ajaxweb/sol/hakkinda/${slug}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': `${BASE_URL}/hakkinda/${slug}`,
                'Origin': BASE_URL,
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
                'Accept': 'text/html, */*; q=0.01',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });

        if (!response || response.status === 0) {
            return JSON.stringify([]);
        }

        const responseText = await response.text();

        if (!responseText) {
            return JSON.stringify([]);
        }

        const episodes = [];

        // Extract film_id from data-id attribute (critical!)
        const filmIdMatch = responseText.match(/data-id=["'](\d+)["']/);
        const filmId = filmIdMatch ? filmIdMatch[1] : '';

        // Look for dublaj link
        const dublajMatch = responseText.match(/href=["']([^"']*\/izle\/dublaj\/[^"']+)["']/i);
        if (dublajMatch) {
            const watchUrl = dublajMatch[1].startsWith('http') ? dublajMatch[1] : BASE_URL + dublajMatch[1];
            episodes.push({
                href: watchUrl + (filmId ? '?fid=' + filmId : ''),
                number: 1
            });
        }

        // Look for altyazi link
        const altyaziMatch = responseText.match(/href=["']([^"']*\/izle\/altyazi\/[^"']+)["']/i);
        if (altyaziMatch) {
            const watchUrl = altyaziMatch[1].startsWith('http') ? altyaziMatch[1] : BASE_URL + altyaziMatch[1];
            episodes.push({
                href: watchUrl + (filmId ? '?fid=' + filmId : ''),
                number: 2
            });
        }

        // If no specific links found, try generic watch page
        if (episodes.length === 0 && filmId) {
            episodes.push({
                href: `${BASE_URL}/izle/dublaj/${slug}?fid=${filmId}`,
                number: 1
            });
        }

        return JSON.stringify(episodes);

    } catch (error) {
        console.log('Episodes error: ' + error);
        return JSON.stringify([]);
    }
}

// ============================================================================
// EXTRACT STREAM URL
// ============================================================================

/**
 * Extracts the stream URL for a movie.
 * @param {string} url - The URL of the watch page.
 * @returns {Promise<string|null>} - The stream URL or multi-server JSON.
 */
async function extractStreamUrl(url) {
    try {
        // Extract film_id from URL or fetch it
        let filmId = '';
        const fidMatch = url.match(/[?&]fid=(\d+)/);
        if (fidMatch) {
            filmId = fidMatch[1];
        }

        // Determine language (0 = dublaj, 1 = altyazi)
        const isDublaj = url.includes('/dublaj/') || !url.includes('/altyazi/');
        const dil = isDublaj ? '0' : '1';

        // If no film_id, try to get it from watch page
        if (!filmId) {
            const slug = extractSlugFromUrl(url);
            if (slug) {
                const detailResponse = await soraFetch(`${BASE_URL}/_ajaxweb/sol/hakkinda/${slug}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
                if (detailResponse) {
                    const idMatch = detailResponse.match(/data-id=["'](\d+)["']/);
                    if (idMatch) filmId = idMatch[1];
                }
            }
        }

        if (!filmId) {
            console.log('Film ID not found');
            return null;
        }

        // Get video sources
        const sourcesResponse = await soraFetch(`${BASE_URL}/ajax/dataAlternatif3.asp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': url
            },
            body: `filmid=${filmId}&dil=${dil}&s=&b=&bot=0`
        });

        if (!sourcesResponse) {
            console.log('No sources response');
            return null;
        }

        const sourcesData = JSON.parse(sourcesResponse);

        if (sourcesData.status !== 'OK' || !sourcesData.data || sourcesData.data.length === 0) {
            console.log('No video sources found');
            return null;
        }

        const streams = [];

        // Process each source
        for (const source of sourcesData.data) {
            try {
                const streamResult = await extractFromSource(source.id, source.baslik, source.kalitesi);
                if (streamResult) {
                    streams.push(streamResult);
                }
            } catch (e) {
                console.log('Source extraction error: ' + e);
            }
        }

        if (streams.length === 0) {
            return null;
        }

        // Return multi-server format
        return JSON.stringify({ streams: streams });

    } catch (error) {
        console.log('Stream URL error: ' + error);
        return null;
    }
}

// ============================================================================
// VIDEO SOURCE EXTRACTION
// ============================================================================

/**
 * Extracts stream URL from a specific video source.
 * @param {number} sourceId - The source ID.
 * @param {string} sourceName - The source name (e.g., "Filemoon").
 * @param {number} quality - The quality (e.g., 1080).
 * @returns {Promise<object|null>} - Stream object or null.
 */
async function extractFromSource(sourceId, sourceName, quality) {
    try {
        // Get embed URL
        const embedResponse = await soraFetch(`${BASE_URL}/ajax/dataEmbed.asp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': BASE_URL
            },
            body: `id=${sourceId}`
        });

        if (!embedResponse) {
            return null;
        }

        // Extract iframe src
        const iframeMatch = embedResponse.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (!iframeMatch) {
            return null;
        }

        let embedUrl = iframeMatch[1];
        if (embedUrl.startsWith('//')) {
            embedUrl = 'https:' + embedUrl;
        }

        // Determine provider and extract
        const lowerEmbedUrl = embedUrl.toLowerCase();
        let streamUrl = null;
        let headers = {};

        if (lowerEmbedUrl.includes('filemoon')) {
            const result = await extractFilemoon(embedUrl);
            streamUrl = result.url;
            headers = result.headers;
        } else if (lowerEmbedUrl.includes('vidmoly')) {
            const result = await extractVidmoly(embedUrl);
            streamUrl = result.url;
            headers = result.headers;
        } else if (lowerEmbedUrl.includes('netu') || lowerEmbedUrl.includes('waaw') || lowerEmbedUrl.includes('hqq')) {
            const result = await extractNetu(embedUrl);
            streamUrl = result.url;
            headers = result.headers;
        } else if (lowerEmbedUrl.includes('ok.ru') || lowerEmbedUrl.includes('odnoklassniki')) {
            const result = await extractOkru(embedUrl);
            streamUrl = result.url;
            headers = result.headers;
        } else if (lowerEmbedUrl.includes('mail.ru')) {
            const result = await extractMailru(embedUrl);
            streamUrl = result.url;
            headers = result.headers;
        } else if (lowerEmbedUrl.includes('dzen') || lowerEmbedUrl.includes('zen.yandex')) {
            const result = await extractDzen(embedUrl);
            streamUrl = result.url;
            headers = result.headers;
        } else if (lowerEmbedUrl.includes('streamruby') || lowerEmbedUrl.includes('rubyvidhub')) {
            const result = await extractStreamruby(embedUrl);
            streamUrl = result.url;
            headers = result.headers;
        } else if (lowerEmbedUrl.includes('pixeldrain')) {
            const result = await extractPixeldrain(embedUrl);
            streamUrl = result.url;
            headers = result.headers;
        } else {
            // Generic extraction attempt
            const result = await extractGeneric(embedUrl);
            streamUrl = result.url;
            headers = result.headers;
        }

        if (!streamUrl) {
            return null;
        }

        return {
            title: `${sourceName || 'Unknown'} ${quality ? quality + 'p' : ''}`.trim(),
            streamUrl: streamUrl,
            headers: headers
        };

    } catch (error) {
        console.log('Source ' + sourceId + ' error: ' + error);
        return null;
    }
}

// ============================================================================
// PROVIDER EXTRACTORS
// ============================================================================

/**
 * Extract from Filemoon
 */
async function extractFilemoon(embedUrl) {
    try {
        // Normalize URL
        let url = embedUrl.replace('/e/', '/d/');
        url = url.replace('filemoon.in', 'filemoon.to').replace('filemoon.sx', 'filemoon.to');

        const response = await soraFetch(url, {
            headers: {
                'Referer': embedUrl,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response) {
            return { url: null, headers: {} };
        }

        // Try to find m3u8 URL
        let m3u8 = null;

        // JWPlayer file pattern
        const jwMatch = response.match(/file:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        if (jwMatch) {
            m3u8 = jwMatch[1];
        }

        // Generic m3u8 pattern
        if (!m3u8) {
            const m3u8Match = response.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i);
            if (m3u8Match) {
                m3u8 = m3u8Match[1];
            }
        }

        return {
            url: m3u8,
            headers: {
                'Referer': 'https://filemoon.to/',
                'Origin': 'https://filemoon.to'
            }
        };
    } catch (e) {
        return { url: null, headers: {} };
    }
}

/**
 * Extract from Vidmoly
 */
async function extractVidmoly(embedUrl) {
    try {
        const response = await soraFetch(embedUrl, {
            headers: {
                'Referer': BASE_URL,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response) {
            return { url: null, headers: {} };
        }

        let m3u8 = null;

        // JWPlayer sources pattern
        const sourcesMatch = response.match(/sources:\s*\[\s*\{\s*file\s*:\s*["']([^"']+)["']/i);
        if (sourcesMatch) {
            m3u8 = sourcesMatch[1];
        }

        // Generic file pattern
        if (!m3u8) {
            const fileMatch = response.match(/file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
            if (fileMatch) {
                m3u8 = fileMatch[1];
            }
        }

        return {
            url: m3u8,
            headers: {
                'Referer': 'https://vidmoly.to/',
                'Origin': 'https://vidmoly.to'
            }
        };
    } catch (e) {
        return { url: null, headers: {} };
    }
}

/**
 * Extract from Netu/Waaw/HQQ
 */
async function extractNetu(embedUrl) {
    try {
        // Normalize URL
        let url = embedUrl.replace('netu.ac', 'netu.tv').replace('/watch/', '/embed/');

        const response = await soraFetch(url, {
            headers: {
                'Referer': BASE_URL,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response) {
            return { url: null, headers: {} };
        }

        let m3u8 = null;

        // JWPlayer file pattern
        const jwMatch = response.match(/file:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        if (jwMatch) {
            m3u8 = jwMatch[1];
        }

        // Sources array pattern
        if (!m3u8) {
            const sourcesMatch = response.match(/sources:\s*\[\s*\{\s*file:\s*["']([^"']+)["']/i);
            if (sourcesMatch) {
                m3u8 = sourcesMatch[1];
            }
        }

        // Generic m3u8 pattern
        if (!m3u8) {
            const genericMatch = response.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i);
            if (genericMatch) {
                m3u8 = genericMatch[1];
            }
        }

        return {
            url: m3u8,
            headers: {
                'Referer': url,
                'Origin': 'https://netu.tv'
            }
        };
    } catch (e) {
        return { url: null, headers: {} };
    }
}

/**
 * Extract from OK.ru
 */
async function extractOkru(embedUrl) {
    try {
        const response = await soraFetch(embedUrl, {
            headers: {
                'Referer': BASE_URL,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response) {
            return { url: null, headers: {} };
        }

        // Find data-options attribute
        const optionsMatch = response.match(/data-options=["']([^"']+)["']/i);
        if (!optionsMatch) {
            return { url: null, headers: {} };
        }

        // Decode HTML entities
        let optionsStr = optionsMatch[1]
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');

        const options = JSON.parse(optionsStr);

        if (!options.flashvars || !options.flashvars.metadata) {
            return { url: null, headers: {} };
        }

        const metadata = JSON.parse(options.flashvars.metadata);

        if (!metadata.videos || metadata.videos.length === 0) {
            return { url: null, headers: {} };
        }

        // Get highest quality
        const qualityOrder = ['ultra', 'quad', 'full', 'hd', 'sd', 'low', 'lowest', 'mobile'];
        let bestVideo = metadata.videos[0];

        for (const q of qualityOrder) {
            const found = metadata.videos.find(v => v.name === q);
            if (found) {
                bestVideo = found;
                break;
            }
        }

        return {
            url: bestVideo.url,
            headers: {
                'Referer': 'https://ok.ru/'
            }
        };
    } catch (e) {
        return { url: null, headers: {} };
    }
}

/**
 * Extract from Mail.ru
 */
async function extractMailru(embedUrl) {
    try {
        const response = await soraFetch(embedUrl, {
            headers: {
                'Referer': BASE_URL,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response) {
            return { url: null, headers: {} };
        }

        // Find metaUrl
        const metaMatch = response.match(/["']metaUrl["']\s*:\s*["']([^"']+)["']/i);
        if (!metaMatch) {
            return { url: null, headers: {} };
        }

        let metaUrl = metaMatch[1];
        if (metaUrl.startsWith('//')) {
            metaUrl = 'https:' + metaUrl;
        }

        const metaResponse = await soraFetch(metaUrl, {
            headers: {
                'Accept': 'application/json',
                'Referer': 'https://my.mail.ru/'
            }
        });

        if (!metaResponse) {
            return { url: null, headers: {} };
        }

        const meta = JSON.parse(metaResponse);

        if (!meta.videos || meta.videos.length === 0) {
            return { url: null, headers: {} };
        }

        // Get highest quality video
        const bestVideo = meta.videos[meta.videos.length - 1];

        return {
            url: bestVideo.url,
            headers: {
                'Referer': 'https://my.mail.ru/',
                'Origin': 'https://my.mail.ru'
            }
        };
    } catch (e) {
        return { url: null, headers: {} };
    }
}

/**
 * Extract from Dzen/Zen.Yandex
 */
async function extractDzen(embedUrl) {
    try {
        const response = await soraFetch(embedUrl, {
            headers: {
                'Referer': BASE_URL,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response) {
            return { url: null, headers: {} };
        }

        // Find streams array
        const streamsMatch = response.match(/"streams"\s*:\s*(\[[^\]]+\])/);
        if (streamsMatch) {
            const streams = JSON.parse(streamsMatch[1]);

            // Prefer HLS
            const hlsStream = streams.find(s => s.type === 'hls');
            if (hlsStream) {
                return {
                    url: hlsStream.url,
                    headers: {
                        'Referer': 'https://dzen.ru/',
                        'Origin': 'https://dzen.ru'
                    }
                };
            }

            // Fallback to first stream
            if (streams.length > 0) {
                return {
                    url: streams[0].url,
                    headers: {
                        'Referer': 'https://dzen.ru/',
                        'Origin': 'https://dzen.ru'
                    }
                };
            }
        }

        // VK HLS fallback
        const vkMatch = response.match(/(https?:\/\/[^"'\s]+vkuser\.net\/video\.m3u8[^"'\s]*)/i);
        if (vkMatch) {
            return {
                url: vkMatch[1],
                headers: {
                    'Referer': 'https://dzen.ru/'
                }
            };
        }

        return { url: null, headers: {} };
    } catch (e) {
        return { url: null, headers: {} };
    }
}

/**
 * Extract from StreamRuby/RubyVidHub
 */
async function extractStreamruby(embedUrl) {
    try {
        const response = await soraFetch(embedUrl, {
            headers: {
                'Referer': BASE_URL,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response) {
            return { url: null, headers: {} };
        }

        let m3u8 = null;

        // JWPlayer sources pattern
        const sourcesMatch = response.match(/sources:\s*\[\s*\{\s*file\s*:\s*["']([^"']+)["']/i);
        if (sourcesMatch) {
            m3u8 = sourcesMatch[1];
        }

        // Generic m3u8 pattern
        if (!m3u8) {
            const m3u8Match = response.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i);
            if (m3u8Match) {
                m3u8 = m3u8Match[1];
            }
        }

        return {
            url: m3u8,
            headers: {
                'Referer': 'https://rubyvidhub.com/',
                'Origin': 'https://rubyvidhub.com'
            }
        };
    } catch (e) {
        return { url: null, headers: {} };
    }
}

/**
 * Extract from PixelDrain
 */
async function extractPixeldrain(embedUrl) {
    try {
        // Extract file ID from URL
        const fileIdMatch = embedUrl.match(/\/u\/([a-zA-Z0-9]+)/);
        if (!fileIdMatch) {
            return { url: null, headers: {} };
        }

        const fileId = fileIdMatch[1];
        const downloadUrl = `https://pixeldrain.com/api/file/${fileId}?download`;

        return {
            url: downloadUrl,
            headers: {}
        };
    } catch (e) {
        return { url: null, headers: {} };
    }
}

/**
 * Generic extraction for unknown providers
 */
async function extractGeneric(embedUrl) {
    try {
        const response = await soraFetch(embedUrl, {
            headers: {
                'Referer': BASE_URL,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response) {
            return { url: null, headers: {} };
        }

        // Try various patterns

        // JWPlayer file
        let m3u8 = null;
        const jwMatch = response.match(/file:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        if (jwMatch) {
            m3u8 = jwMatch[1];
        }

        // Sources array
        if (!m3u8) {
            const sourcesMatch = response.match(/sources:\s*\[\s*\{\s*file:\s*["']([^"']+)["']/i);
            if (sourcesMatch) {
                m3u8 = sourcesMatch[1];
            }
        }

        // Generic m3u8 URL
        if (!m3u8) {
            const genericMatch = response.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i);
            if (genericMatch) {
                m3u8 = genericMatch[1];
            }
        }

        // Generic mp4 URL
        if (!m3u8) {
            const mp4Match = response.match(/(https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*)/i);
            if (mp4Match) {
                m3u8 = mp4Match[1];
            }
        }

        // Extract domain for referer
        const domainMatch = embedUrl.match(/https?:\/\/([^\/]+)/);
        const domain = domainMatch ? domainMatch[0] : '';

        return {
            url: m3u8,
            headers: domain ? { 'Referer': domain + '/' } : {}
        };
    } catch (e) {
        return { url: null, headers: {} };
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extract slug from various URL formats
 */
function extractSlugFromUrl(url) {
    if (!url) return null;

    // /hakkinda/{slug}
    let match = url.match(/\/hakkinda\/([^\/\?#]+)/);
    if (match) return match[1];

    // /izle/{type}/{slug}
    match = url.match(/\/izle\/[^\/]+\/([^\/\?#]+)/);
    if (match) return match[1];

    // Last path segment
    match = url.match(/\/([^\/\?#]+)\/?$/);
    if (match && !match[1].includes('.')) return match[1];

    return null;
}

/**
 * Clean title (remove year, extra whitespace)
 */
function cleanTitle(title) {
    if (!title) return '';
    return title.replace(/\s*\(\d{4}\)\s*$/, '').trim();
}

/**
 * Normalize image URL (add domain if needed)
 */
function normalizeImageUrl(url) {
    if (!url) return '';
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return BASE_URL + url;
    return url;
}

/**
 * Extract content using regex from HTML
 */
function extractFromHtml(html, regex) {
    const match = html.match(regex);
    return match ? match[1] : null;
}

/**
 * Clean HTML tags from text
 */
function cleanHtml(text) {
    if (!text) return '';
    return text
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

// ============================================================================
// SORA FETCH WRAPPER
// ============================================================================

/**
 * Fetch function with Sora compatibility
 * Uses Sunduq's exact pattern with fetchv2's 5th parameter = true
 */
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null, encoding: 'utf-8' }) {
    try {
        return await fetchv2(
            url,
            options.headers ?? {},
            options.method ?? 'GET',
            options.body ?? null,
            true,
            options.encoding ?? 'utf-8'
        );
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            console.log('soraFetch error: ' + error);
            return null;
        }
    }
}
