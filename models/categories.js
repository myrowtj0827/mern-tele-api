const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * Categories schema
 */
const CategoriesSchema = new Schema({
    general: {
        type: String,
        required: false,
    },

    cate: {
        type: Object,
        required: false,
    },
});

module.exports = Categories = mongoose.model("categories", CategoriesSchema);
