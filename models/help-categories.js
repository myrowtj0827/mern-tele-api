const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * Help Categories schema
 */
const HelpCategoriesSchema = new Schema({
    cate: {
        type: Object,
        required: false,
    },
});
module.exports = HelpCategories = mongoose.model("help-categories", HelpCategoriesSchema);
