const OrganizerProfile = require("../models/organizerProfile");

const isOrganizer = (user) => user && user.role === "organizer";

const normalizeString = (value) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : "";
};

const buildResponseProfile = (profile, user) => ({
  id: profile.id,
  displayName: profile.displayName || user.fullName || "",
  registeredEmail: user.email,
  contactEmail: profile.contactEmail || user.email,
  phone: profile.phone || user.phone || "",
  address: profile.address || "",
  about: profile.about || "",
  createdAt: profile.createdAt,
  updatedAt: profile.updatedAt,
});

const getOrCreateProfile = async (user) => {
  let profile = await OrganizerProfile.findOne({ user: user._id });

  if (!profile) {
    profile = await OrganizerProfile.create({
      user: user._id,
      displayName: user.fullName,
      contactEmail: user.email,
      phone: user.phone || "",
      address: "",
      about: "",
    });
  }

  return profile;
};

const handleGetMyOrganizerProfile = async (req, res, next) => {
  try {
    if (!isOrganizer(req.user)) {
      const error = new Error("Access denied. Organizer role required");
      error.status = 403;
      throw error;
    }

    const profile = await getOrCreateProfile(req.user);

    res.status(200).json({
      message: "Organizer profile fetched successfully",
      profile: buildResponseProfile(profile, req.user),
    });
  } catch (error) {
    next(error);
  }
};

const handleUpdateMyOrganizerProfile = async (req, res, next) => {
  try {
    if (!isOrganizer(req.user)) {
      const error = new Error("Access denied. Organizer role required");
      error.status = 403;
      throw error;
    }

    const updates = {};

    if (Object.prototype.hasOwnProperty.call(req.body, "displayName")) {
      updates.displayName = normalizeString(req.body.displayName);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "contactEmail")) {
      updates.contactEmail = normalizeString(req.body.contactEmail);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "phone")) {
      updates.phone = normalizeString(req.body.phone);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "address")) {
      updates.address = normalizeString(req.body.address);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "about")) {
      updates.about = normalizeString(req.body.about);
    }

    if (Object.keys(updates).length === 0) {
      const error = new Error("No valid fields to update");
      error.status = 400;
      throw error;
    }

    const profile = await getOrCreateProfile(req.user);

    Object.assign(profile, updates);
    await profile.save();

    res.status(200).json({
      message: "Organizer profile updated successfully",
      profile: buildResponseProfile(profile, req.user),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  handleGetMyOrganizerProfile,
  handleUpdateMyOrganizerProfile,
};
