/**
 * Tạo pagination metadata
 * @param {number} totalItems - Tổng số items
 * @param {number} page - Trang hiện tại
 * @param {number} limit - Số items per page
 * @returns {Object} Pagination metadata
 */
const createPaginationMetadata = (totalItems, page, limit) => {
  const currentPage = parseInt(page, 10) || 1;
  const itemsPerPage = parseInt(limit, 10) || 10;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const skip = (currentPage - 1) * itemsPerPage;

  return {
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
    skip,
  };
};

/**
 * Tạo aggregation stages cho pagination với MongoDB
 * @param {number} page - Trang hiện tại
 * @param {number} limit - Số items per page
 * @returns {Object} Các stages cho aggregation pipeline
 */
const createPaginationStages = (page = 1, limit = 10) => {
  const { skip, itemsPerPage } = createPaginationMetadata(0, page, limit);

  return {
    // Stage để đếm tổng số documents
    countStage: [{ $count: "total" }],

    // Stage để lấy data với pagination
    dataStages: [{ $skip: skip }, { $limit: itemsPerPage }],

    // $facet stage hoàn chỉnh để combine count và data
    facetStage: {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: itemsPerPage }],
      },
    },
  };
};

/**
 * Xử lý kết quả từ aggregation với $facet
 * @param {Array} results - Kết quả từ aggregation
 * @param {number} page - Trang hiện tại
 * @param {number} limit - Số items per page
 * @returns {Object} Formatted response với data và pagination
 */
const formatPaginatedResponse = (results, page, limit) => {
  const data = results[0]?.data || [];
  const totalItems = results[0]?.metadata[0]?.total || 0;

  const pagination = createPaginationMetadata(totalItems, page, limit);

  return {
    data,
    pagination: {
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      totalItems: pagination.totalItems,
      itemsPerPage: pagination.itemsPerPage,
      hasNextPage: pagination.hasNextPage,
      hasPreviousPage: pagination.hasPreviousPage,
    },
  };
};

module.exports = {
  createPaginationMetadata,
  createPaginationStages,
  formatPaginatedResponse,
};
