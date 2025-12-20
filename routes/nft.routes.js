const router = require("express").Router();
const { getMetadata } = require("../controllers/nft.controller");

// Public endpoint cho NFT metadata: baseURI + tokenId
router.get("/:tokenId", getMetadata);

module.exports = router;
