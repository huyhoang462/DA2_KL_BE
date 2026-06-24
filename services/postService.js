const mongoose = require("mongoose");
const Post = require("../models/post");
const Event = require("../models/event");
const Ticket = require("../models/ticket");

const POST_STATUS_VALUES = ["pending", "published", "rejected", "removed"];
const POST_TYPE_VALUES = ["event_promotion", "marketplace_listing"];

const getAllPosts = async ({
  page = 1,
  limit = 10,
  status,
  postType,
  authorId,
}) => {
  const parsedPage = Number(page);
  const parsedLimit = Number(limit);

  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    const error = new Error("page must be a positive integer");
    error.status = 400;
    throw error;
  }

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    const error = new Error("limit must be an integer between 1 and 100");
    error.status = 400;
    throw error;
  }

  const query = {};

  if (status) {
    if (!POST_STATUS_VALUES.includes(status)) {
      const error = new Error("Invalid status value");
      error.status = 400;
      throw error;
    }
    query.status = status;
  } else {
    query.status = { $in: ["pending", "published"] };
  }

  if (postType) {
    if (!POST_TYPE_VALUES.includes(postType)) {
      const error = new Error("Invalid postType value");
      error.status = 400;
      throw error;
    }
    query.postType = postType;
  }

  if (authorId) {
    if (!mongoose.Types.ObjectId.isValid(authorId)) {
      const error = new Error("Invalid authorId format");
      error.status = 400;
      throw error;
    }
    query.author = authorId;
  }

  const skip = (parsedPage - 1) * parsedLimit;

  const [posts, totalItems] = await Promise.all([
    Post.find(query)
      .select("-relatedTickets._id") // Không trả về _id của subdocument relatedTickets (walletAddress tự động được trả về)
      .populate("author", "fullName email role")
      .populate(
        "relatedEvent",
        "name startDate bannerImageUrl status location format",
      )
      .populate({
        path: "relatedTickets.ticket",
        select: "status owner ticketType tokenId",
        populate: {
          path: "ticketType",
          select: "name price show",
          populate: {
            path: "show",
            select: "name ",
          },
        },
      })
      .lean()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit),
    Post.countDocuments(query),
  ]);

  const totalPages = Math.ceil(totalItems / parsedLimit) || 1;

  return {
    message: "Posts fetched successfully",
    data: posts,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      totalItems,
      totalPages,
      hasNextPage: parsedPage < totalPages,
      hasPrevPage: parsedPage > 1,
    },
  };
};

const getPostById = async (id) => {
  // 1. Kiểm tra định dạng ObjectId của MongoDB
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error("Invalid post ID format");
    error.status = 400;
    throw error;
  }

  // 2. Tìm kiếm post theo ID và populate các field giống hệt hàm getAllPosts
  const post = await Post.findById(id)
    .populate("author", "fullName email role")
    .populate("relatedEvent", "name startDate bannerImageUrl status location")
    .populate({
      path: "relatedTickets.ticket",
      select: "status ticketType",
      populate: {
        path: "ticketType",
        select: "name price",
      },
    });

  // 3. Kiểm tra xem post có tồn tại hay không
  if (!post) {
    const error = new Error("Post not found");
    error.status = 404; // Trả về 404 nếu không tìm thấy bài viết
    throw error;
  }

  // 4. Trả về kết quả theo cấu trúc dữ liệu quen thuộc của bạn
  return {
    message: "Post fetched successfully",
    data: post,
  };
};

const createPost = async ({ author, data }) => {
  if (!author || !author._id) {
    const error = new Error("Author information is required");
    error.status = 401;
    throw error;
  }

  const {
    content,
    images,
    walletAddress,
    relatedEvent,
    relatedTickets,
    postType,
  } = data;

  if (!content || typeof content !== "string" || !content.trim()) {
    const error = new Error("content is required");
    error.status = 400;
    throw error;
  }

  const trimmedContent = content.trim();

  let normalizedImages = [];
  if (images !== undefined) {
    if (!Array.isArray(images)) {
      const error = new Error("images must be an array of image URLs");
      error.status = 400;
      throw error;
    }

    normalizedImages = images
      .filter((image) => typeof image === "string")
      .map((image) => image.trim())
      .filter(Boolean);
  }

  if (postType && !POST_TYPE_VALUES.includes(postType)) {
    const error = new Error("Invalid postType value");
    error.status = 400;
    throw error;
  }

  if (relatedEvent) {
    if (!mongoose.Types.ObjectId.isValid(relatedEvent)) {
      const error = new Error("Invalid relatedEvent ID format");
      error.status = 400;
      throw error;
    }

    const existingEvent = await Event.findById(relatedEvent).select("_id");
    if (!existingEvent) {
      const error = new Error("Related event not found");
      error.status = 404;
      throw error;
    }
  }
  let normalizedRelatedTickets = [];

  if (postType === "marketplace_listing")
    if (Array.isArray(relatedTickets)) {
      normalizedRelatedTickets = relatedTickets.map((t) => ({
        ticket: t?.ticketId,
        price: t?.price,
      }));
    } else {
      const error = new Error(
        "Type of relatedTickets is invalid. It must be an array of { ticket: ObjectId, price: number }",
      );
      error.status = 404;
      throw error;
    }

  if (normalizedRelatedTickets.length > 0) {
    const seen = new Set();

    for (const item of normalizedRelatedTickets) {
      console.log("Validating related ticket item:", item);
      const ticketId = item?.ticket;
      const itemPrice = item?.price;

      if (!ticketId || !mongoose.Types.ObjectId.isValid(ticketId)) {
        const error = new Error("Invalid relatedTickets ticket ID format");
        error.status = 400;
        throw error;
      }

      if (typeof itemPrice !== "number" || itemPrice <= 0) {
        const error = new Error(
          `Each relatedTickets item must have a positive price: ${itemPrice}`,
        );
        error.status = 400;
        throw error;
      }

      const key = ticketId.toString();
      if (seen.has(key)) {
        const error = new Error("Duplicate ticket in relatedTickets array");
        error.status = 400;
        throw error;
      }
      seen.add(key);
    }
  }

  if (postType === "marketplace_listing") {
    if (normalizedRelatedTickets.length === 0) {
      const error = new Error(
        "relatedTickets is required for marketplace_listing postType",
      );
      error.status = 400;
      throw error;
    }
  }

  const session = await mongoose.startSession();
  let newPost;

  try {
    await session.startTransaction();

    // Validate tickets exist before saving post (inside transaction)
    const ticketIds = normalizedRelatedTickets.map((t) => t.ticket);
    if (ticketIds.length > 0) {
      const existingTickets = await Ticket.find({ _id: { $in: ticketIds } })
        .select(" status")
        .session(session)
        .lean();

      if (existingTickets.length !== ticketIds.length) {
        const error = new Error("One or more related tickets not found");
        error.status = 404;
        throw error;
      }
    }

    newPost = new Post({
      author: author._id,
      authorType: author.role === "organizer" ? "organizer" : "user",
      content: trimmedContent,
      images: normalizedImages,
      walletAddress: walletAddress ? walletAddress.trim() : undefined,
      relatedEvent: relatedEvent || undefined,
      relatedTickets:
        normalizedRelatedTickets.length > 0
          ? normalizedRelatedTickets
          : undefined,
      postType: postType || "event_promotion",
    });

    await newPost.save({ session });

    // Nếu post liên quan ticket => chuyển tất cả vé sang selling
    if (ticketIds.length > 0) {
      const updateResult = await Ticket.updateMany(
        { _id: { $in: ticketIds }, status: "pending" },
        { $set: { status: "selling" } },
        { session },
      );

      if ((updateResult.modifiedCount || 0) !== ticketIds.length) {
        const error = new Error(
          "One or more tickets are not available for selling (must be pending)",
        );
        error.status = 400;
        throw error;
      }
    }

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }

  const populatedPost = await Post.findById(newPost._id)
    .populate("author", "fullName email role")
    .populate("relatedEvent", "name startDate bannerImageUrl status")
    .populate({
      path: "relatedTickets.ticket",
      select: "status ticketType",
      populate: {
        path: "ticketType",
        select: "name price",
      },
    });

  return {
    message: "Post created successfully",
    post: populatedPost,
  };
};

const deletePost = async ({ postId, userId, userRole }) => {
  if (!postId) {
    const error = new Error("Post ID is required");
    error.status = 400;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(postId)) {
    const error = new Error("Invalid post ID format");
    error.status = 400;
    throw error;
  }

  const post = await Post.findById(postId);
  if (!post) {
    const error = new Error("Post not found");
    error.status = 404;
    throw error;
  }

  const isOwner = post.author.toString() === userId.toString();
  const isAdmin = userRole === "admin";

  if (!isOwner && !isAdmin) {
    const error = new Error(
      "Forbidden: You do not have permission to delete this post",
    );
    error.status = 403;
    throw error;
  }

  const session = await mongoose.startSession();
  let deletedPost;

  try {
    await session.startTransaction();

    // Nếu post liên quan ticket và vé đang selling => trả vé về pending
    const relatedTickets = Array.isArray(post.relatedTickets)
      ? post.relatedTickets
      : [];
    const ticketIds = relatedTickets.map((t) => t?.ticket).filter(Boolean);

    const uniqueTicketIds = Array.from(
      new Set(ticketIds.map((id) => id.toString())),
    );

    if (uniqueTicketIds.length > 0) {
      await Ticket.updateMany(
        { _id: { $in: uniqueTicketIds }, status: "selling" },
        { $set: { status: "pending" } },
        { session },
      );
    }

    deletedPost = await Post.findByIdAndDelete(postId, { session });

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }

  return {
    message: "Post deleted successfully",
    post: deletedPost,
  };
};

module.exports = {
  getAllPosts,
  getPostById,
  createPost,
  deletePost,
};
