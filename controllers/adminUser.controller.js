const {
  getAllUsers,
  getUserById,
  updateUserRole,
  banUser,
  unbanUser,
  deleteUser,
  getUserOrders,
  getUserEvents,
} = require("../services/adminUserService");

/**
 * GET /api/admin/users
 * Lấy danh sách tất cả users với filters và pagination
 */
const handleGetAllUsers = async (req, res, next) => {
  try {
    const {
      search,
      role,
      status,
      sortBy,
      sortOrder,
      page = 1,
      limit = 20,
    } = req.query;

    const filters = {
      search,
      role,
      status,
      sortBy,
      sortOrder,
    };

    console.log("[ADMIN USER] Getting all users with filters:", filters);

    const result = await getAllUsers(filters, page, limit);
    res.status(200).json(result);
  } catch (error) {
    console.error("[ADMIN USER] Error getting all users:", error);
    next(error);
  }
};

/**
 * GET /api/admin/users/:id
 * Lấy thông tin chi tiết một user
 */
const handleGetUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    console.log("[ADMIN USER] Getting user by ID:", id);

    const result = await getUserById(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("[ADMIN USER] Error getting user by ID:", error);
    next(error);
  }
};

/**
 * PATCH /api/admin/users/:id/role
 * Cập nhật role của user
 */
const handleUpdateUserRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const adminId = req.user._id;

    console.log("[ADMIN USER] Updating user role:", { id, role, adminId });

    if (!role) {
      const error = new Error("Role is required");
      error.status = 400;
      throw error;
    }

    const result = await updateUserRole(id, role, adminId);
    res.status(200).json(result);
  } catch (error) {
    console.error("[ADMIN USER] Error updating user role:", error);
    next(error);
  }
};

/**
 * POST /api/admin/users/:id/ban
 * Ban user
 */
const handleBanUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user._id;

    console.log("[ADMIN USER] Banning user:", { id, reason, adminId });

    if (!reason) {
      const error = new Error("Ban reason is required");
      error.status = 400;
      throw error;
    }

    const result = await banUser(id, reason, adminId);
    res.status(200).json(result);
  } catch (error) {
    console.error("[ADMIN USER] Error banning user:", error);
    next(error);
  }
};

/**
 * POST /api/admin/users/:id/unban
 * Unban user
 */
const handleUnbanUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    console.log("[ADMIN USER] Unbanning user:", { id, adminId });

    const result = await unbanUser(id, adminId);
    res.status(200).json(result);
  } catch (error) {
    console.error("[ADMIN USER] Error unbanning user:", error);
    next(error);
  }
};

/**
 * DELETE /api/admin/users/:id
 * Xóa user (soft delete hoặc hard delete)
 */
const handleDeleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { hardDelete = false } = req.query;
    const adminId = req.user._id;

    console.log("[ADMIN USER] Deleting user:", { id, hardDelete, adminId });

    const result = await deleteUser(id, adminId, hardDelete === "true");
    res.status(200).json(result);
  } catch (error) {
    console.error("[ADMIN USER] Error deleting user:", error);
    next(error);
  }
};

/**
 * GET /api/admin/users/:id/orders
 * Lấy danh sách đơn hàng của user với phân trang và thống kê
 */
const handleGetUserOrders = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10, status, startDate, endDate } = req.query;

    const filters = { status, startDate, endDate };

    console.log("[ADMIN USER] Getting user orders:", {
      id,
      page,
      limit,
      filters,
    });

    const result = await getUserOrders(id, page, limit, filters);
    res.status(200).json(result);
  } catch (error) {
    console.error("[ADMIN USER] Error getting user orders:", error);
    next(error);
  }
};

/**
 * GET /api/admin/users/:id/events
 * Lấy danh sách sự kiện đã tạo bởi user với phân trang và thống kê
 */
const handleGetUserEvents = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10, status, startDate, endDate } = req.query;

    const filters = { status, startDate, endDate };

    console.log("[ADMIN USER] Getting user events:", {
      id,
      page,
      limit,
      filters,
    });

    const result = await getUserEvents(id, page, limit, filters);
    res.status(200).json(result);
  } catch (error) {
    console.error("[ADMIN USER] Error getting user events:", error);
    next(error);
  }
};

module.exports = {
  handleGetAllUsers,
  handleGetUserById,
  handleUpdateUserRole,
  handleBanUser,
  handleUnbanUser,
  handleDeleteUser,
  handleGetUserOrders,
  handleGetUserEvents,
};
