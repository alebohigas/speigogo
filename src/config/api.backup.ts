/**
 * API Configuration
 * Global configuration for webservice endpoints
 * Contains base URLs and endpoint builders for all APIs
 */

// ============= Base URL Configuration =============
// Base URL for the webservice - change this to point to your server
export const API_BASE_URL = 'https://alien.speigogo.com/app';

// ============= Logos Base URL =============
// Base URL for club logo images
export const LOGOS_BASE_URL = 'https://alien.speigogo.com/logos';

// ============= Endpoint Builders =============

/**
 * Get players list URL by category ID
 * @param catId - Category ID from the database
 * @returns Full URL for the players API endpoint
 */
export const getPlayersApiUrl = (catId: string): string => {
  return `${API_BASE_URL}/lista_jug.php?catid=${catId}`;
};

/**
 * Get full logo URL from logo filename
 * @param logoFilename - Logo filename from API response
 * @returns Full URL for the logo image
 */
export const getLogoUrl = (logoFilename: string): string => {
  return `${LOGOS_BASE_URL}/${logoFilename}`;
};

/**
 * Expected JSON response format from the webservice:
 * {
 *   "players": [
 *     {
 *       "id": "262184",
 *       "numjugador": "",
 *       "jugador": "Player Name",      // Player name
 *       "logo": "logo_club.png",       // Logo filename
 *       "hi": "0",                      // Handicap Index
 *       "hc": "1",                      // Handicap de Juego (HC)
 *       "hn": "0"                       // Handicap Neto
 *     }
 *   ]
 * }
 */
