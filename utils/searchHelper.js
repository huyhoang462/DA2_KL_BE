/**
 * Utility functions cho search - xử lý tiếng Việt không dấu, fuzzy matching
 */

/**
 * Bỏ dấu tiếng Việt
 * @param {string} str - Chuỗi cần bỏ dấu
 * @returns {string} Chuỗi đã bỏ dấu
 */
const removeDiacritics = (str) => {
  if (!str) return "";

  const diacriticsMap = {
    à: "a",
    á: "a",
    ả: "a",
    ã: "a",
    ạ: "a",
    ă: "a",
    ằ: "a",
    ắ: "a",
    ẳ: "a",
    ẵ: "a",
    ặ: "a",
    â: "a",
    ầ: "a",
    ấ: "a",
    ẩ: "a",
    ẫ: "a",
    ậ: "a",
    đ: "d",
    è: "e",
    é: "e",
    ẻ: "e",
    ẽ: "e",
    ẹ: "e",
    ê: "e",
    ề: "e",
    ế: "e",
    ể: "e",
    ễ: "e",
    ệ: "e",
    ì: "i",
    í: "i",
    ỉ: "i",
    ĩ: "i",
    ị: "i",
    ò: "o",
    ó: "o",
    ỏ: "o",
    õ: "o",
    ọ: "o",
    ô: "o",
    ồ: "o",
    ố: "o",
    ổ: "o",
    ỗ: "o",
    ộ: "o",
    ơ: "o",
    ờ: "o",
    ớ: "o",
    ở: "o",
    ỡ: "o",
    ợ: "o",
    ù: "u",
    ú: "u",
    ủ: "u",
    ũ: "u",
    ụ: "u",
    ư: "u",
    ừ: "u",
    ứ: "u",
    ử: "u",
    ữ: "u",
    ự: "u",
    ỳ: "y",
    ý: "y",
    ỷ: "y",
    ỹ: "y",
    ỵ: "y",
  };

  return str.toLowerCase().replace(/./g, (char) => diacriticsMap[char] || char);
};

/**
 * Normalize text cho search: lowercase + bỏ dấu + trim + collapse spaces
 * @param {string} text - Text cần normalize
 * @returns {string} Text đã normalize
 */
const normalizeSearchText = (text) => {
  if (!text) return "";
  return removeDiacritics(text).toLowerCase().trim().replace(/\s+/g, " "); // collapse multiple spaces
};

/**
 * Tính độ tương đồng giữa 2 chuỗi (Levenshtein distance)
 * @param {string} str1
 * @param {string} str2
 * @returns {number} Similarity score 0-1 (1 = giống nhất)
 */
const calculateSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const len1 = str1.length;
  const len2 = str2.length;

  // Nếu độ dài chênh lệch quá nhiều -> không tương đồng
  if (Math.abs(len1 - len2) > Math.max(len1, len2) * 0.5) return 0;

  // Matrix cho Levenshtein distance
  const matrix = Array(len2 + 1)
    .fill(null)
    .map(() => Array(len1 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;

  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // insertion
        matrix[j - 1][i] + 1, // deletion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  const distance = matrix[len2][len1];
  const maxLength = Math.max(len1, len2);

  // Convert distance to similarity score (0-1)
  return 1 - distance / maxLength;
};

/**
 * Kiểm tra xem query có chứa trong text không (bỏ dấu)
 * @param {string} text - Text cần kiểm tra
 * @param {string} query - Query cần tìm
 * @returns {boolean}
 */
const containsNormalized = (text, query) => {
  const normalizedText = normalizeSearchText(text);
  const normalizedQuery = normalizeSearchText(query);
  return normalizedText.includes(normalizedQuery);
};

/**
 * Expand query thành các variants có thể (xử lý viết tắt, typos)
 * @param {string} query - Query gốc
 * @returns {Array<string>} Mảng các variants
 */
const expandQueryVariants = (query) => {
  const normalized = normalizeSearchText(query);
  const variants = [normalized];

  // Mapping các từ viết tắt phổ biến
  const abbreviationMap = {
    tt: ["tet", "tết", "tết nguyên đán"],
    tet: ["tết", "tết nguyên đán"],
    xmas: ["giang sinh", "giáng sinh", "noel"],
    "giang sinh": ["giáng sinh", "noel", "christmas"],
    haloween: ["halloween", "hội hóa trang"],
    td: ["the duc", "thể dục", "thể thao"],
    am: ["am nhac", "âm nhạc", "nhạc"],
    nhac: ["nhạc", "âm nhạc", "music"],
    music: ["nhạc", "âm nhạc", "ca nhạc"],
    concert: ["hoa nhạc", "hòa nhạc", "nhạc hội"],
    hoa: ["hòa nhạc", "concert"],
    ws: ["workshop", "hội thảo"],
    "hoi thao": ["hội thảo", "seminar", "workshop"],
    talkshow: ["talk show", "giao lưu"],
    "giao luu": ["giao lưu", "talk show"],
    festival: ["lễ hội", "le hoi"],
    "le hoi": ["lễ hội", "festival"],
    expo: ["triển lãm", "trien lam", "exhibition"],
    "trien lam": ["triển lãm", "exhibition", "expo"],
    cafe: ["cà phê", "ca phe", "coffee"],
    "ca phe": ["cà phê", "café", "coffee"],
    spa: ["massage", "thư giãn", "thu gian"],
    yoga: ["thiền", "thien", "meditation"],
    gym: ["thể hình", "the hinh", "fitness"],
    "the hinh": ["thể hình", "gym", "fitness"],
    "the thao": ["thể thao", "sport", "sports"],
    sport: ["thể thao", "the thao"],
    theater: ["nhà hát", "nha hat", "kịch", "kich"],
    "nha hat": ["nhà hát", "theater", "kịch"],
    movie: ["phim", "cinema", "rạp"],
    phim: ["cinema", "movie", "rạp chiếu"],
    "rap chieu": ["rạp chiếu", "cinema", "movie theater"],
    standup: ["stand-up", "độc thoại", "doc thoai"],
    "doc thoai": ["độc thoại", "stand-up", "standup comedy"],
  };

  // Thêm variants từ abbreviation map
  const lowerQuery = normalized.toLowerCase();
  if (abbreviationMap[lowerQuery]) {
    variants.push(...abbreviationMap[lowerQuery]);
  }

  // Thêm original query (có dấu)
  if (query !== normalized) {
    variants.push(query.toLowerCase().trim());
  }

  return [...new Set(variants)]; // Remove duplicates
};

/**
 * Tìm các từ tương tự trong một list (dùng fuzzy matching)
 * @param {string} query - Query cần tìm
 * @param {Array<string>} candidates - List các từ candidates
 * @param {number} threshold - Ngưỡng similarity (0-1), default 0.5
 * @returns {Array<{text: string, score: number}>} Sorted by score desc
 */
const findSimilarWords = (query, candidates, threshold = 0.5) => {
  const normalizedQuery = normalizeSearchText(query);

  const results = candidates
    .map((candidate) => {
      const normalizedCandidate = normalizeSearchText(candidate);
      const score = calculateSimilarity(normalizedQuery, normalizedCandidate);
      return { text: candidate, score };
    })
    .filter((item) => item.score >= threshold)
    .sort((a, b) => b.score - a.score);

  return results;
};

/**
 * Build regex pattern cho MongoDB với support nhiều variants
 * @param {Array<string>} variants - Mảng các query variants
 * @returns {RegExp} Regex pattern
 */
const buildSearchRegex = (variants) => {
  // Escape special regex characters cho mỗi variant
  const escapedVariants = variants.map((v) =>
    v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );

  // Combine thành một regex với OR operator
  const pattern = escapedVariants.join("|");
  return new RegExp(pattern, "i");
};

module.exports = {
  removeDiacritics,
  normalizeSearchText,
  calculateSimilarity,
  containsNormalized,
  expandQueryVariants,
  findSimilarWords,
  buildSearchRegex,
};
