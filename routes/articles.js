const express = require("express");
const router = express.Router();
const mongoose = require('mongoose');

const Articles = require("../models/articles");
const Categories = require("../models/categories");
const Comments = require("../models/comments");
const Users = require("../models/user");
const PrivateNotes = require("../models/private-notes");
const striptags = require('striptags');

/**
 * Registering the posted article
 */
router.all("/post-article", async (req, res) => {
    if(req.body.category_id === '') {
        console.log("Please select the category.");
        return res.status(400).json({msg: 'Please select the category.'});
    } else if (req.body.title === '') {
        console.log("Please input the title.");
        return res.status(400).json({msg: 'Please input the title.'});
    }

    const newArticles = await new Articles({
        category_id: req.body.category_id,
        user_id: req.body.user_id,
        title: req.body.title.charAt(0).toUpperCase() + req.body.title.slice(1),
        content: req.body.content,
        writtenDate: new Date().toLocaleDateString([], {
            year: 'numeric',
            month: 'long',
            day: '2-digit',
        }),
    });

    await newArticles.save();
    console.log("An article registration succeeded.");
    return res.status(200).json({msg: 'An article registration succeeded.'});
});

/**
 * Updating the posted article
 */
router.all("/update-article", async (req, res) => {
    if(req.body.category_id === '') {
        console.log("Please select the category.");
        return res.status(400).json({msg: 'Please select the category.'});
    } else if (req.body.title === '') {
        console.log("Please input the title.");
        return res.status(400).json({msg: 'Please input the title.'});
    }
    Articles.collection.updateOne(
        { _id: mongoose.Types.ObjectId(req.body._id)},
        [{
            $set: {
                title: req.body.title,
                content: req.body.content,
                writtenDate: new Date().toLocaleDateString([], {
                    year: 'numeric',
                    month: 'long',
                    day: '2-digit',
                }),
            }
        }])
        .then(temp => {
            console.log("The article updated successfully.");
            return res.status(200).json({msg: "The article updated successfully."});
        })
        .catch(err => {
            console.log("The article updating failed.", err.toString());
            return res.status(400).json({msg: err.toString()});
        });
});
/**
 * Article List Published by me
 */
router.all("/get-published", async (req, res) => {
    let data = {
        user_id: req.body.user_id,
        $and: [{deleted_date: null}],
    };
    if(req.body.category_id !== '0') {
        data = {
            user_id: req.body.user_id,
            category_id: req.body.category_id,
            $and: [{deleted_date: null}],
        }
    }

    const pagination = req.body.pagination ? parseInt(req.body.pagination) : 10;
    const page_number = req.body.current_page ? parseInt(req.body.current_page) : 1;
    const page_neighbours = req.body.page_neighbours ? parseInt(req.body.page_neighbours) : 1;

    const total_list_count = await Articles.collection.countDocuments(data);
    const total_page = Math.ceil(total_list_count/pagination);

    const start_page = Math.max(1, page_number - page_neighbours);
    const end_page = Math.min(total_page, page_number + page_neighbours);
    const page_num = {
        start_page: start_page,
        end_page: end_page,
        total_page: total_page,
    };

    Articles.aggregate([
        { $match: data },
        {
            $lookup:
                {
                    from: 'users',
                    let: {"user_id": "$user_id"},
                    pipeline: [
                        {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$user_id"]}}},
                        {$project: {"name": 1}}
                    ],
                    as: 'users'
                }
        }])
        .collation({locale: 'en', strength: 2})
        .sort({writtenDate: -1})
        .skip((page_number - 1) * pagination)
        .limit(pagination)
        .then(async articleList => {
            if(articleList){
                for (let k = 0; k < articleList.length; k ++) {
                    articleList[k]['content'] = striptags(articleList[k]['content']);
                    if (articleList[k]['title'].length > 70) {
                        articleList[k]['title'] = articleList[k]['title'].slice(0, 69) + "...";
                    }
                    if (articleList[k]['content'].length > 180) {
                        articleList[k]['content'] = articleList[k]['content'].slice(0, 179) + "...";
                    }
                    /**
                     * Getting comment count to this article
                     */
                    let data_articleId = {
                        article_id:  articleList[k]['_id'],
                    };
                    articleList[k]['nComment'] = await Comments.find(data_articleId)
                        .then(articleComments => {
                            return articleComments.length;
                        }).catch(err => {
                            return res.status(400).json({msg: err.toString()});
                        });
                }

                const result = {
                    list: articleList,
                    page_num: page_num,
                };
                return res.status(200).json({msg: 'The article list published by me got successfully.', results: result});
            } else {
                return res.status(400).json({msg: 'The article don\'t exist at all.'});
            }
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        });
});
/**
 * The Whole Article List
 */
router.all("/get-all-articles", async (req, res) => {
    let data = {
        $and: [{deleted_date: null}],
    };

    if(req.body.category_id !== '0') {
        data = {
            category_id: req.body.category_id,
            $and: [{deleted_date: null}],
        }
    }

    const pagination = req.body.pagination ? parseInt(req.body.pagination) : 10;
    const page_number = req.body.current_page ? parseInt(req.body.current_page) : 1;
    const page_neighbours = req.body.page_neighbours ? parseInt(req.body.page_neighbours) : 1;

    const total_list_count = await Articles.collection.countDocuments(data);
    const total_page = Math.ceil(total_list_count/pagination);

    const start_page = Math.max(1, page_number - page_neighbours);
    const end_page = Math.min(total_page, page_number + page_neighbours);

    const page_num = {
        start_page: start_page,
        end_page: end_page,
        total_page: total_page,
    };

    Articles.aggregate([
        { $match: data },
        {
            $lookup:
                {
                    from: 'users',
                    let: {"user_id": "$user_id"},
                    pipeline: [
                        {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$user_id"]}}},
                        {$project: {"name": 1}}
                    ],
                    as: 'users'
                }
        }])
        .collation({locale: 'en', strength: 2})
        .sort({writtenDate: -1})
        .skip((page_number - 1) * pagination)
        .limit(pagination)
        .then(async allArticleList => {
            if(allArticleList){
                for (let i = 0; i < allArticleList.length; i ++) {
                    /**
                     * Getting of the first image path
                     */
                    let nSearch = '<img src="';
                    let src = '';
                    if(allArticleList[i]['content'].includes(nSearch)) {
                        let secondSearch = ' alt="undefined"';
                        let n1 = allArticleList[i]['content'].search(nSearch) + 10;
                        src = allArticleList[i]['content'].slice(n1);
                        let n2 = src.search(secondSearch) -1 ;
                        src = src.slice(0, n2);
                    }
                    allArticleList[i]['src'] = src;
                    allArticleList[i]['content'] = striptags(allArticleList[i]['content']);
                    const sLen = req.body.sLen? req.body.sLen : 70;
                    if (allArticleList[i]['title'].length > sLen) {
                        allArticleList[i]['title'] = allArticleList[i]['title'].slice(0, sLen - 1) + "...";
                    }
                    if (allArticleList[i]['content'].length > 180) {
                        allArticleList[i]['content'] = allArticleList[i]['content'].slice(0, 179) + "...";
                    }
                    /**
                     * Getting comment count to this article
                     */
                    let data_articleId = {
                            article_id:  allArticleList[i]['_id'],
                        };
                    allArticleList[i]['nComment'] = await Comments.find(data_articleId)
                        .then(articleComments => {
                            return articleComments.length;
                        }).catch(err => {
                            return res.status(400).json({msg: err.toString()});
                        });
                }

                const result = {
                    list: allArticleList,
                    page_num: page_num,
                };

                return res.status(200).json({msg: 'The article list got successfully.', results: result});
            } else {
                return res.status(400).json({msg: 'The article don\'t exist at all.'});
            }
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        });
});

/**
 * Getting of 10 recent posted article list
 */
router.all("/get-recent-list", async (req, res) => {
    let len = 10;
    let data = {
        $and: [{deleted_date: null}],
    };

    Articles.aggregate([{
        $match: data,
    },
        //["-category_id", "-content", "-writtenDate", "-user_id"])
        ])
        .collation({locale: 'en', strength: 2})
        .sort({likes: -1})
        .then(async allArticleTitleList => {
            if(allArticleTitleList){
                let recentList = [];
                if(allArticleTitleList.length < 10) {
                    len = allArticleTitleList.length;
                }

                for (let i = 0; i < len; i ++) {
                    if (allArticleTitleList[i]['title'].length > 60) {
                        allArticleTitleList[i]['title'] = allArticleTitleList[i]['title'].slice(0, 59) + "...";
                    }
                    recentList.push(allArticleTitleList[i]);
                }

                console.log("The recent article list got successfully.");
                return res.status(200).json({msg: 'The recent article list got successfully.', results: recentList});
            } else {
                return res.status(400).json({msg: 'The article don\'t exist at all.'});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Article Details for editing by _id
 */
router.all("/edit-article", async (req, res) => {
    let data = {
            _id:  mongoose.Types.ObjectId(req.body._id),
        };

    Articles.aggregate([
        { $match: data },
        {
            $lookup:
                {
                    from: 'users',
                    let: {"user_id": "$user_id"},
                    pipeline: [
                        {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$user_id"]}}},
                        {$project: {"name": 1}}
                    ],
                    as: 'users'
                }
        }])
        .then(articleDetails => {
            if(articleDetails.length !== 0){
                return res.status(200).json({msg: 'The article details got successfully.', results: articleDetails});
            } else {
                console.log('The article don\'t exist.');
                return res.status(400).json({msg: 'This article don\'t exist.'});
            }
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        });
});

/**
 * Article Details for displaying by _id
 */
router.all("/get-article", async (req, res) => {
    let data = {
        _id:  mongoose.Types.ObjectId(req.body._id),
        $and: [{deleted_date: null}],
    };
    let flag_readers = 0;
    let flag_reader_cookie = [];

    await Articles.findOne(data)
        .then(temp => {
            if(temp.readers) flag_readers = temp.readers;
            if(temp.reader_cookie) flag_reader_cookie = temp.reader_cookie;
        }).catch(e => {
            return res.status(400).json({msg: e.toString()});
        });

    if(flag_reader_cookie === 0 || flag_readers === 0) {
        flag_readers = 1;
        flag_reader_cookie = [req.body.uid];
        Articles.collection.updateOne(
            { _id: mongoose.Types.ObjectId(req.body._id)},
            [{
                $set: {
                    readers: flag_readers,
                    reader_cookie: flag_reader_cookie,
                }
            }])
    } else if(flag_reader_cookie.includes(req.body.uid) === false){
        flag_readers += 1;
        flag_reader_cookie.push(req.body.uid);

        Articles.collection.updateOne(
            { _id: mongoose.Types.ObjectId(req.body._id)},
            [{
                $set: {
                    readers: flag_readers,
                    reader_cookie: flag_reader_cookie,
                }
            }]);
    }

    /**
     * Prev Id and next Id
     */
    let prevId = '';
    let nexId = '';
    await Articles.aggregate([{
        $match: {$and: [{deleted_date: null}],},
    }])
        .then(temp => {
            let nPosition = 0;
            let nLen = temp.length;
            for (let i = 0; i < nLen; i ++) {
                if(temp[i]._id.toString() === req.body._id.toString()) {
                    nPosition = i;
                    break;
                }
            }
            if(nPosition === 0) {
                prevId = temp[nLen - 1]._id;
                nexId = temp[1]._id;
            } else if (nPosition === nLen - 1) {
                prevId = temp[nLen - 2]._id;
                nexId = temp[0]._id;
            } else {
                prevId = temp[nPosition - 1]._id;
                nexId = temp[nPosition + 1]._id;
            }
        }).catch(e => {
            return res.status(400).json({msg: e.toString()});
        });

    Articles.aggregate([
        { $match: data },
        {
            $lookup:
                {
                    from: 'users',
                    let: {"user_id": "$user_id"},
                    pipeline: [
                        {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$user_id"]}}},
                        {$project: {"name": 1, "photo": 1}}
                    ],
                    as: 'users'
                }
        }])
        .then(articleDetails => {
            if(articleDetails.length !== 0){
                /**
                 * Getting of the first image path
                 */
                let nSearch = '<img src="';
                let src = '';
                if(articleDetails[0]['content'].includes(nSearch)) {
                    let secondSearch = ' alt="undefined"';
                    let n1 = articleDetails[0]['content'].search(nSearch) + 10;
                    src = articleDetails[0]['content'].slice(n1);
                    let n2 = src.search(secondSearch) -1 ;
                    src = src.slice(0, n2);
                }

                articleDetails[0]['src'] = src;
                articleDetails[0]['content'] = striptags(articleDetails[0]['content']);
                articleDetails[0]['prev_id'] = prevId;
                articleDetails[0]['next_id'] = nexId;

                return res.status(200).json({msg: 'The article details got successfully.', results: articleDetails});
            } else {
                console.log('The article don\'t exist.');
                return res.status(400).json({msg: 'This article don\'t exist.'});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Delete Article By _ID
 * @type {Router}
 */
router.all("/delete-article", async (req, res) => {
    Articles.collection.updateOne({
        _id: mongoose.Types.ObjectId(req.body._id),
    }, [{
        $set: {
            deleted_date: new Date().toLocaleDateString([], {
                year: 'numeric',
                month: 'long',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            }),
        }
    }])
        .then(() => {
            console.log('The article deleted successfully.');
            return res.status(200).json({msg: 'The article deleted successfully.'});
        }).catch(err => {
        console.log(err.toString());
        return res.status(400).json({msg: err.toString()});
    });

});

/**
 * Adding the category
 */
router.all("/add-category", async (req, res) => {
    if(req.body.category === '') {
        console.log("Please input the category.");
        return res.status(400).json({msg: "Please input the category."});
    }

    let jsonStr;
    Categories.find({})
        .then(async categoryList => {
            if(categoryList.length === 1 && categoryList[0].cate === undefined) {
                await Categories.collection.deleteOne({
                    _id: mongoose.Types.ObjectId(categoryList[0]._id)
                });
                const newCategory = new Categories({
                    cate: {'1': req.body.category.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase())},
                });
                newCategory.save();
                console.log("The category inserted successfully.");
                return res.status(200).json({msg: "The category inserted successfully."});
            }

            if(categoryList[0] !== undefined && categoryList[0].cate !== null  && categoryList.length > 0) {
                jsonStr = categoryList[0].cate;
                let arrayKeys = Object.keys(jsonStr);
                let _key = arrayKeys.length;
                let nFlag = false;

                for(let k = 0; k < _key; k ++) {
                    /**
                     * Getting of key and key value
                     */
                    let key = arrayKeys[k];
                    let nValue = jsonStr[key];
                    if(nValue.toLocaleString() === req.body.category.toLowerCase()) {
                        nFlag = true;
                        break;
                    }
                }

                if(nFlag === true) {
                    console.log("The same category already exit.");
                    return res.status(400).json({msg: "The same category already exit."});
                }

                jsonStr[(_key + 1).toString()] = req.body.category.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase());

                await Categories.collection.updateOne(
                    { _id: mongoose.Types.ObjectId(categoryList[0]._id)},
                    [{
                        $set: {
                            cate: jsonStr,
                        }
                    }])
                    .then(temp => {
                        console.log("The category added successfully.");
                        return res.status(200).json({msg: "The category added successfully."});
                    })
                    .catch(err => {
                        console.log("The category adding failed.", err.toString());
                        return res.status(400).json({msg: err.toString()});
                    });
            } else {
                if(categoryList[0] && categoryList[0].cate === null) {
                    Categories.collection.deleteOne({
                            _id: mongoose.Types.ObjectId(categoryList[0]._id)
                    });
                }

                const newCategory = new Categories({
                    cate: {'1': req.body.category.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase())},
                });
                newCategory.save();
                console.log("The category inserted successfully.");
                return res.status(200).json({msg: "The category inserted successfully."});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Deleting the category
 */
router.all("/delete-category", async (req, res) => {
    if (req.body.category === '') {
        console.log("Please input the category correctly.");
        return res.status(400).json({msg: "Please input the category correctly."});
    }

    let jsonStr;
    Categories.find({})
        .then(async categoryList => { console.log(categoryList.length);
            if(categoryList.length === 1 && categoryList[0].cate === undefined) {
                await Categories.collection.deleteOne({
                    _id: mongoose.Types.ObjectId(categoryList[0]._id)
                });
                return res.status(200).json({msg: "The database empty"});
            }

            if(categoryList.length > 0) {
                jsonStr = categoryList[0].cate;
                let arrayKeys = Object.keys(jsonStr);
                let _key = arrayKeys.length;
                let nFlag = false;

                for(let k = 0; k < _key; k ++) {
                    /**
                     * Getting of key and key value
                     */
                    let key = arrayKeys[k];
                    let nValue = jsonStr[key].toLowerCase();
                    if(nValue === req.body.category.toLowerCase()) {
                        nFlag = key;
                        break;
                    }
                }

                if(nFlag === false) {
                    console.log("The such category don't exit.");
                    return res.status(400).json({msg: "The such category don't exit."});
                } else {
                    delete jsonStr[nFlag.toString()];
                }

                await Categories.collection.deleteOne({
                    _id: mongoose.Types.ObjectId(categoryList[0]._id)
                });

                const newCategory = await new Categories({
                    cate: jsonStr,
                });
                newCategory.save();
                console.log("The category deleted successfully.");
                return res.status(200).json({msg: "The category deleted successfully."});
            } else {
                console.log("The category list empty.");
                return res.status(200).json({msg: "The category list empty."});
            }
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        });
});

/**
 * Category List
 */
router.all("/get-category-list", async (req, res) => {
    Categories.find({})
        .then(categoryList => {
            if(categoryList.length !== 0){
                return res.status(200).json({msg: 'The category list got successfully.', results: categoryList});
            } else {
                return res.status(400).json({msg: 'The category don\'t exist at all.'});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Posting the comment
 */
router.all("/post-comment", async (req, res) => {
    if(!req.body.content) {
        return res.status(200).json({msg: "Please input the content of the comment."})
    }
    const newComments = await new Comments({
        article_id: req.body.article_id,
        content: req.body.content,
        writtenDate: new Date().toLocaleString([], {
            year: 'numeric',
            month: 'long',
            day: '2-digit',
            hour: "numeric",
            minute: "numeric"
        }),
    });

    newComments.save();
    console.log("An comment registration succeeded.");
    return res.status(200).json({msg: 'An comment registration succeeded.'});
});

/**
 * Getting the comments by article ID
 * @type {Router}
 */
router.all("/get-comment", async (req, res) => {
    let data = {
        article_id:  req.body._id,
    };
    Comments.find(data)
        .collation({locale: 'en', strength: 2})
        .sort({writtenDate: -1})
        .then(articleComments => {
            if(articleComments){
                return res.status(200).json({msg: 'The article details got successfully.', results: articleComments});
            } else {
                return res.status(400).json({msg: 'This article don\'t exist.'});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Posting the like or dislike
 */
router.all("/post-like", async (req, res) => {
    //let browserDevice = req.headers['user-agent'];
    let flag_like = 0;
    let flag_dislike = 0;
    let flag_likers = [];
    let flag_dislikers = [];

    await Articles.findOne({_id: mongoose.Types.ObjectId(req.body.article_id)})
        .then(temp => {
            if(temp.likes) flag_like = temp.likes;
            if(temp.dislikes)flag_dislike = temp.dislikes;
            if(temp.likers)flag_likers = temp.likers;
            if(temp.dislikers)flag_dislikers = temp.dislikers;
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        });

    if(req.body.status === 'like') {
        if(flag_like === 0 || flag_likers === []) {
            flag_like = 1;
            flag_likers = [req.body.uid];
        } else if(flag_likers.includes(req.body.uid) === false) {
            flag_like += 1;
            flag_likers.push(req.body.uid);
        }

        if(flag_dislike !== 0 && flag_dislikers !== []) {
            if(flag_dislikers.includes(req.body.uid) === true) {
                flag_dislike -= 1;
                flag_dislikers.splice(flag_dislikers.indexOf(req.body.uid), 1);
            }
        }
    } else if(req.body.status === 'disLike') {
        if(flag_dislike === 0 || flag_dislikers === []) {
            flag_dislike = 1;
            flag_dislikers = [req.body.uid];
        } else if(flag_dislikers.includes(req.body.uid) === false) {
            flag_dislike += 1;
            flag_dislikers.push(req.body.uid);
        }

        if(flag_like !== 0 && flag_likers !== []) {
            if(flag_likers.includes(req.body.uid) === true) {
                flag_like -= 1;
                flag_likers.splice(flag_likers.indexOf(req.body.uid), 1);
            }
        }
    }


    Articles.collection.updateOne(
        { _id: mongoose.Types.ObjectId(req.body.article_id)},
        [{
            $set: {
                likes: flag_like,
                dislikes: flag_dislike,
                likers: flag_likers,
                dislikers: flag_dislikers,
            }
        }])
        .then(temp => {
            console.log("The like/dislike updated successfully.");
            return res.status(200).json({msg: "The like/dislike updated successfully.", results: temp});
        })
        .catch(err => {
            console.log("The like/dislike updating failed.", err.toString());
            return res.status(400).json({msg: err.toString()});
        });
});

/**
 * Registering the posted Notes
 */
router.all("/post-notes", async (req, res) => {
    const privateNotes = await new PrivateNotes({
        provider_id: req.body.provider_id,
        client_id: req.body.client_id,
        notes: req.body.content,
        updated_date: new Date().toLocaleDateString([], {
            year: 'numeric',
            month: 'long',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        }),
    });
    await privateNotes.save();
    console.log("The notes registration succeeded.");
    return res.status(200).json({msg: 'The notes registration succeeded.'});
});
/**
 * Updating the posted Notes
 */
router.all("/update-notes", async (req, res) => {
    await PrivateNotes.collection.updateOne(
        { _id: mongoose.Types.ObjectId(req.body._id) },
        [{
            $set: {
                notes: req.body.content,
                updated_date: new Date().toLocaleDateString([], {
                    year: 'numeric',
                    month: 'long',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                }),
            }
        }]);
    return res.status(200).json({msg: 'The notes has updated.'});
});
/**
 * Deleting the posted Notes
 */
router.all("/delete-notes", async (req, res) => {
    PrivateNotes.collection.updateOne(
        { _id: mongoose.Types.ObjectId(req.body._id) },
        [{
            $set: {
                deleted_date: new Date().toLocaleDateString([], {
                    year: 'numeric',
                    month: 'long',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                }),
            }
        }]);
    return res.status(200).json({msg: 'The notes has deleted.'});
});

/**
 * Getting the posted notes
 * @type {Router}
 */
router.all("/get-notes", async (req, res) => {
    const data = {
        $and: [{deleted_date: null}],
        provider_id: req.body.provider_id,
        client_id: req.body.client_id,
    };

    const pagination = req.body.appointment_pagination ? parseInt(req.body.appointment_pagination) : 10;
    const page_number = req.body.appointment_current_page ? parseInt(req.body.appointment_current_page) : 1;
    const page_neighbours = req.body.appointment_page_neighbours ? parseInt(req.body.appointment_page_neighbours) : 1;

    const total_list_count = await PrivateNotes.countDocuments(data);
    const total_page = Math.ceil(total_list_count / pagination);

    const start_page = Math.max(1, page_number - page_neighbours);
    const end_page = Math.min(total_page, page_number + page_neighbours);
    const page_num = {
        start_page: start_page,
        end_page: end_page,
        total_page: total_page,
        num_total: total_list_count,
    };
    await PrivateNotes.aggregate([
        {$match: data},
    ])
        .collation({locale: 'en', strength: 2})
        .skip((page_number - 1) * pagination)
        .limit(pagination)
        .then(async item => {
           for (let s of item) {
               s.notes = striptags(s.notes);
           }

           const result = {
               list: item,
               page_num: page_num,
           };
           return res.status(200).json({results: result});
       }).catch(err => {
           return res.status(400).json({msg: err.toString()});
       });
});

/**
 * Getting one notes by ID
 * @type {Router}
 */
router.all("/get-one-note",async (req, res) => {
    const data = {
     _id: mongoose.Types.ObjectId(req.body._id),
        $and: [{deleted_date: null}],
    };

    const item = await PrivateNotes.findOne(data);
    console.log(item);
    return res.status(200).json({results: item});

});
module.exports = router;