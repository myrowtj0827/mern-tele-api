const express = require("express");
const router = express.Router();
const mongoose = require('mongoose');
const striptags = require('striptags');

const HelpArticles = require("../models/helps-articles");
const HelpCategories = require("../models/help-categories");
const Comments = require("../models/comments");
const Users = require("../models/user");

/**
 * Registering the posted article
 */
router.all("/post-article", async (req, res) => {
    if (req.body.category_id === '') {
        return res.status(400).json({msg: 'Please select the category.'});
    } else if (req.body.title === '') {
        return res.status(400).json({msg: 'Please input the title.'});
    }

    const newArticles = await new HelpArticles({
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
    newArticles.save();
    return res.status(200).json({msg: 'An article registration succeeded.'});
});

/**
 * Updating the posted article
 */
router.all("/update-article", async (req, res) => {
    if (req.body.category_id === '') {
        return res.status(400).json({msg: 'Please select the category.'});
    } else if (req.body.title === '') {
        return res.status(400).json({msg: 'Please input the title.'});
    }
    HelpArticles.collection.updateOne(
        {_id: mongoose.Types.ObjectId(req.body._id)},
        [{
            $set: {
                title: req.body.title.charAt(0).toUpperCase() + req.body.title.slice(1),
                content: req.body.content,
                writtenDate: new Date().toLocaleDateString([], {
                    year: 'numeric',
                    month: 'long',
                    day: '2-digit',
                }),
            }
        }])
        .then(temp => {
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
    if (req.body.category_id !== '0') {
        data = {
            user_id: req.body.user_id,
            category_id: req.body.category_id,
            $and: [{deleted_date: null}],
        }
    }

    const pagination = req.body.pagination ? parseInt(req.body.pagination) : 10;
    const page_number = req.body.current_page ? parseInt(req.body.current_page) : 1;
    const page_neighbours = req.body.page_neighbours ? parseInt(req.body.page_neighbours) : 1;

    const total_list_count = await HelpArticles.collection.countDocuments(data);
    const total_page = Math.ceil(total_list_count / pagination);

    const start_page = Math.max(1, page_number - page_neighbours);
    const end_page = Math.min(total_page, page_number + page_neighbours);
    const page_num = {
        start_page: start_page,
        end_page: end_page,
        total_page: total_page,
    };

    HelpArticles.aggregate([
        {$match: data},
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
            if (articleList) {
                for (let k = 0; k < articleList.length; k++) {
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
                        article_id: articleList[k]['_id'],
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
                return res.status(200).json({
                    msg: 'The article list published by me got successfully.',
                    results: result
                });
            } else {
                return res.status(400).json({msg: 'The article don\'t exist at all.'});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Article List By one static category for provider admin
 */
router.all("/get-all-articles", async (req, res) => {
    let data = {$and: [{deleted_date: null}],};
    if (req.body.category_id !== '0') {
        data = {
            category_id: req.body.category_id,
            $and: [{deleted_date: null}],
        };
    }

    HelpArticles.aggregate([
        {$match: data},
        {
            $lookup:
                {
                    from: 'users',
                    let: {"user_id": "$user_id"},
                    pipeline: [
                        {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$user_id"]}}},
                        {$project: {"name": 1}}
                    ],
                    as: 'users',
                }
        }])
        .collation({locale: 'en', strength: 2})
        .sort({writtenDate: -1})
        .then(async allArticleList => {
            if (allArticleList) {
                for (let i = 0; i < allArticleList.length; i++) {
                    /**
                     * Getting of the first image path
                     */
                    let nSearch = '<img src="';
                    let src = '';
                    if (allArticleList[i]['content'].includes(nSearch)) {
                        let secondSearch = ' alt="undefined"';
                        let n1 = allArticleList[i]['content'].search(nSearch) + 10;
                        src = allArticleList[i]['content'].slice(n1);
                        let n2 = src.search(secondSearch) - 1;
                        src = src.slice(0, n2);
                    }
                    allArticleList[i]['src'] = src;
                    allArticleList[i]['content'] = striptags(allArticleList[i]['content']);
                    const sLen = req.body.sLen ? req.body.sLen : 70;
                    if (allArticleList[i]['title'].length > sLen) {
                        allArticleList[i]['title'] = allArticleList[i]['title'].slice(0, sLen - 1) + "...";
                    }
                    if (allArticleList[i]['content'].length > 180) {
                        allArticleList[i]['content'] = allArticleList[i]['content'].slice(0, 179) + "...";
                    }
                }

                const pagination = req.body.pagination ? parseInt(req.body.pagination) : 10;
                const page_number = req.body.current_page ? parseInt(req.body.current_page) : 1;
                const page_neighbours = req.body.page_neighbours ? parseInt(req.body.page_neighbours) : 1;

                const total_page = Math.ceil(allArticleList.length / pagination);
                const start_page = Math.max(1, page_number - page_neighbours);
                const end_page = Math.min(total_page, page_number + page_neighbours);
                const page_num = {
                    start_page: start_page,
                    end_page: end_page,
                    total_page: total_page,
                };

                const result = {
                    list: allArticleList.slice((page_number - 1) * pagination, page_number * pagination),
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
 * Help Article Details for displaying by _id for provider admin
 */
router.all("/get-article", async (req, res) => {
    let data = {
        _id: mongoose.Types.ObjectId(req.body._id),
        $and: [{deleted_date: null}],
    };
    let flag_readers = 0;
    let flag_reader_cookie = [];

    await HelpArticles.findOne(data)
        .then(temp => {
            if (temp.readers) flag_readers = temp.readers;
            if (temp.reader_cookie) flag_reader_cookie = temp.reader_cookie;
        }).catch(e => {
            return res.status(400).json({msg: e.toString()});
        });

    if (flag_reader_cookie === 0 || flag_readers === 0) {
        flag_readers = 1;
        flag_reader_cookie = [req.body.uid];
        HelpArticles.collection.updateOne(
            {_id: mongoose.Types.ObjectId(req.body._id)},
            [{
                $set: {
                    readers: flag_readers,
                    reader_cookie: flag_reader_cookie,
                }
            }])

    } else if (flag_reader_cookie.includes(req.body.uid) === false) {
        flag_readers += 1;
        flag_reader_cookie.push(req.body.uid);

        HelpArticles.collection.updateOne(
            {_id: mongoose.Types.ObjectId(req.body._id)},
            [{
                $set: {
                    readers: flag_readers,
                    reader_cookie: flag_reader_cookie,
                }
            }]);
    }

    HelpArticles.aggregate([
        {$match: data},
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
            if (articleDetails.length !== 0) {

                /**
                 * Getting of the first image path
                 */
                let nSearch = '<img src="';
                let src = '';
                if (articleDetails[0]['content'].includes(nSearch)) {
                    let secondSearch = ' alt="undefined"';
                    let n1 = articleDetails[0]['content'].search(nSearch) + 10;
                    src = articleDetails[0]['content'].slice(n1);
                    let n2 = src.search(secondSearch) - 1;
                    src = src.slice(0, n2);
                }

                articleDetails[0]['src'] = src;
                articleDetails[0]['content'] = striptags(articleDetails[0]['content']);
                return res.status(200).json({msg: 'The article details got successfully.', results: articleDetails});
            } else {
                return res.status(400).json({msg: 'This article don\'t exist.'});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Getting of 10 liked article list
 */
router.all("/get-recent-list", async (req, res) => {
    let len = 10;
    HelpArticles.aggregate([{
        $match: {$and: [{deleted_date: null}],},
    }])
        //["-category_id", "-content", "-writtenDate", "-user_id"])
        .collation({locale: 'en', strength: 2})
        .sort({writtenDate: -1})
        .then(async allArticleTitleList => {
            if (allArticleTitleList) {
                let recentList = [];
                if (allArticleTitleList.length < 10) {
                    len = allArticleTitleList.length;
                }

                for (let i = 0; i < len; i++) {
                    if (allArticleTitleList[i]['title'].length > 60) {
                        allArticleTitleList[i]['title'] = allArticleTitleList[i]['title'].slice(0, 59) + "...";
                    }
                    recentList.push(allArticleTitleList[i]);
                }
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
        _id: mongoose.Types.ObjectId(req.body._id),
    };

    HelpArticles.aggregate([
        {$match: data},
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
            if (articleDetails.length !== 0) {
                return res.status(200).json({msg: 'The article details got successfully.', results: articleDetails});
            } else {
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
    HelpArticles.findOne({_id: mongoose.Types.ObjectId(req.body._id)})
        .then(temp => {
            if (temp.length !== 0) {
                HelpArticles.collection.updateOne({
                        _id: mongoose.Types.ObjectId(temp._id),
                    },
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
                return res.status(200).json({msg: 'The article deleted successfully.'});
            } else {
                return res.status(400).json({msg: 'This article don\'t exist.'});
            }
        }).catch(err => {
        console.log(err.toString());
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Category List
 */
router.all("/get-category-list", async (req, res) => {
    const data = {
        '1': "General",
        '2': "Clients",
        '3': "Payments",
        '4': "Providers",
        '5': "Technical",
        '6': "Marketing",
    };

    HelpCategories.find({})
        .then(async categoryList => {
            if (categoryList.length > 0) {
                if (JSON.stringify(data) !== JSON.stringify(categoryList[0].cate)) {
                    await HelpCategories.collection.deleteMany({});
                    const newHelpCategory = await new HelpCategories({
                        cate: data,
                    });
                    await newHelpCategory.save();
                }
            } else {
                const newHelpCategory = await new HelpCategories({
                    cate: data,
                });
                await newHelpCategory.save();
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });

    HelpCategories.find({})
        .then(categoryList => {
            if (categoryList.length !== 0) {
                return res.status(200).json({msg: 'The category list got successfully.', results: categoryList});
            } else {
                return res.status(400).json({msg: 'The category don\'t exist at all.'});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Article Count to the static category
 */
router.all("/help-center", async (req, res) => {
    const STATIC_DESC = {
        '1': "The concept of telehealth isn’t new. In fact, one the earliest conceptions of something akin to modern telehealth was described in the cover story of Radio News in April, 1924. The story...",
        '2': "The concept of telehealth isn’t new. In fact, one the earliest conceptions of something akin to modern telehealth was described in the cover story of Radio News in April, 1924. The story...",
        '3': "The concept of telehealth isn’t new. In fact, one the earliest conceptions of something akin to modern telehealth was described in the cover story of Radio News in April, 1924. The story...",
        '4': "The concept of telehealth isn’t new. In fact, one the earliest conceptions of something akin to modern telehealth was described in the cover story of Radio News in April, 1924. The story...",
        '5': "The concept of telehealth isn’t new. In fact, one the earliest conceptions of something akin to modern telehealth was described in the cover story of Radio News in April, 1924. The story...",
        '6': "The concept of telehealth isn’t new. In fact, one the earliest conceptions of something akin to modern telehealth was described in the cover story of Radio News in April, 1924. The story...",
    };
    let ncountFilter = [];

    await HelpCategories
        .find()
        .then(async item => {
            const temp = item[0].cate;

            for (const item of Object.keys(temp)) {
                let data = {
                    category_id: item,
                    $and: [{deleted_date: null}],
                };

                let str = STATIC_DESC[item];
                if (str.length > 190) {
                    str = str.slice(0, 189) + '...';
                }
                await HelpArticles.aggregate([{
                    $match: data,
                }])
                    .then(list => {
                        const arrayEle = {
                            key: item,
                            category: temp[item],
                            nCount: list.length,
                            description: str,
                        };
                        ncountFilter.push(arrayEle);
                    }).catch(err => {
                        return res.status(400).json({msg: err.toString()});
                    })
            }

            return res.status(200).json({msg: "Getting of the article count succeed.", results: ncountFilter});
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        })
});

/**
 * Article Count By one static category
 */
router.all("/help-count-category", async (req, res) => {
    const STATIC_DESC = {
        '1': "The concept of telehealth isn’t new. In fact, one the earliest conceptions of something akin to modern telehealth was described in the cover story of Radio News in April, 1924. The story...",
        '2': "The concept of telehealth isn’t new. In fact, one the earliest conceptions of something akin to modern telehealth was described in the cover story of Radio News in April, 1924. The story...",
        '3': "The concept of telehealth isn’t new. In fact, one the earliest conceptions of something akin to modern telehealth was described in the cover story of Radio News in April, 1924. The story...",
        '4': "The concept of telehealth isn’t new. In fact, one the earliest conceptions of something akin to modern telehealth was described in the cover story of Radio News in April, 1924. The story...",
        '5': "The concept of telehealth isn’t new. In fact, one the earliest conceptions of something akin to modern telehealth was described in the cover story of Radio News in April, 1924. The story...",
        '6': "The concept of telehealth isn’t new. In fact, one the earliest conceptions of something akin to modern telehealth was described in the cover story of Radio News in April, 1924. The story...",
    };
    let ncountFilter = [];

    await HelpCategories
        .find({})
        .then(async items => {
            const temp = items[0].cate;
            for (const item of Object.keys(temp)) {
                if (temp[item].toLowerCase() === req.body.key) {
                    let data = {
                        category_id: item,
                    };

                    let str = STATIC_DESC[item];
                    if (str.length > 190) {
                        str = str.slice(0, 189) + '...';
                    }
                    await HelpArticles.find(data)
                        .then(list => {
                            const arrayEle = {
                                key: item,
                                category: temp[item],
                                nCount: list.length,
                                description: str,
                            };
                            ncountFilter.push(arrayEle);
                        }).catch(err => {
                            return res.status(400).json({msg: err.toString()});
                        })
                }
            }
            return res.status(200).json({msg: "Getting of the article count succeed.", results: ncountFilter});
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        })
});

/**
 * Article List By one static category
 */
router.all("/help-articles-category", async (req, res) => {
    let data = {$and: [{deleted_date: null}],};
    await HelpCategories
        .find({})
        .then(async items => {
            const temp = items[0].cate;
            for (const item of Object.keys(temp)) {
                if (temp[item].toLowerCase() === req.body.key) {
                    data = {
                        category_id: item,
                        $and: [{deleted_date: null}],
                    }
                }
            }
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        });

    const pagination = req.body.pagination ? parseInt(req.body.pagination) : 10;
    const page_number = req.body.current_page ? parseInt(req.body.current_page) : 1;
    const page_neighbours = req.body.page_neighbours ? parseInt(req.body.page_neighbours) : 1;

    const total_list_count = await HelpArticles.collection.countDocuments(data);
    const total_page = Math.ceil(total_list_count / pagination);

    const start_page = Math.max(1, page_number - page_neighbours);
    const end_page = Math.min(total_page, page_number + page_neighbours);
    const page_num = {
        start_page: start_page,
        end_page: end_page,
        total_page: total_page,
    };

    HelpArticles.aggregate([
        {$match: data},
        {
            $lookup:
                {
                    from: 'users',
                    let: {"user_id": "$user_id"},
                    pipeline: [
                        {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$user_id"]}}},
                        {$project: {"name": 1}}
                    ],
                    as: 'users',

                }
        }])
        .collation({locale: 'en', strength: 2})
        .sort({writtenDate: -1})
        .skip((page_number - 1) * pagination)
        .limit(pagination)
        .then(async allArticleList => {
            if (allArticleList) {
                for (let i = 0; i < allArticleList.length; i++) {
                    /**
                     * Getting of the first image path
                     */
                    let nSearch = '<img src="';
                    let src = '';
                    if (allArticleList[i]['content'].includes(nSearch)) {
                        let secondSearch = ' alt="undefined"';
                        let n1 = allArticleList[i]['content'].search(nSearch) + 10;
                        src = allArticleList[i]['content'].slice(n1);
                        let n2 = src.search(secondSearch) - 1;
                        src = src.slice(0, n2);
                    }
                    allArticleList[i]['src'] = src;
                    allArticleList[i]['content'] = striptags(allArticleList[i]['content']);
                    const sLen = req.body.sLen ? req.body.sLen : 70;
                    if (allArticleList[i]['title'].length > sLen) {
                        allArticleList[i]['title'] = allArticleList[i]['title'].slice(0, sLen - 1) + "...";
                    }
                    if (allArticleList[i]['content'].length > 180) {
                        allArticleList[i]['content'] = allArticleList[i]['content'].slice(0, 179) + "...";
                    }
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
 * Article List By the search filtering
 */
router.all("/help-center-search", async (req, res) => {
    let data = {$and: [{deleted_date: null}],};
    let searchResults = [];
    HelpArticles.aggregate([
        {
            $match: data,
        },
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
        .then(async items => {
            for (let item of items) {
                let str = item.title.toLowerCase() + " " + striptags(item.content).toLowerCase().replace("-", ' ');
                let sKey = req.body.key.toLowerCase().replace("-", ' ');
                let sKeyArray = sKey.replace(/[\.,:;()\[\]\n]+/g, "").replace('&nbsp', '').replace("  ", " ").split(" ");
                let flag = true;

                for (let s of sKeyArray) {
                    if (str.includes(s) === false) {
                        flag = false;
                        break;
                    }
                }
                if (flag === true) {
                    searchResults.push(item);
                }
            }

            const pagination = req.body.pagination ? parseInt(req.body.pagination) : 10;
            const page_number = req.body.current_page ? parseInt(req.body.current_page) : 1;
            const page_neighbours = req.body.page_neighbours ? parseInt(req.body.page_neighbours) : 1;

            const total_page = Math.ceil(searchResults.length / pagination);
            const start_page = Math.max(1, page_number - page_neighbours);
            const end_page = Math.min(total_page, page_number + page_neighbours);
            const page_num = {
                start_page: start_page,
                end_page: end_page,
                total_page: total_page,
            };

            const result = {
                list: searchResults.slice((page_number - 1) * pagination, page_number * pagination),
                page_num: page_num,
            };
            return res.status(200).json({msg: 'The article list got successfully.', results: result});
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Getting article By the title filtering
 */
router.all("/help-center-title", async (req, res) => {
    let data = {$and: [{deleted_date: null}],};
    await HelpArticles
        .aggregate([{
            $match: data,
        }])
        .then(async items => {
            let flag;
            for (let item of items) {
                if (item.title.toLowerCase() === req.body.title.toLowerCase()) {
                    flag = item._id;
                    break;
                }
            }

            if (flag === undefined) {
                return res.status(400).json({msg: "An article have the such title does not exit."})
            } else {
                return res.status(200).json({msg: "The getting of the article succeed.", results: flag});
            }
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        });
});

/**
 * Help Article Details for displaying by _id
 */
router.all("/get-help-article", async (req, res) => {
    let str = {};
    let data = {
        _id: mongoose.Types.ObjectId(req.body.category_id),
    };
    let flag_readers = 0;
    let flag_reader_cookie = [];

    await HelpArticles.findOne(data)
        .then(temp => {
            if (temp.readers) flag_readers = temp.readers;
            if (temp.reader_cookie) flag_reader_cookie = temp.reader_cookie;
        }).catch(e => {
            return res.status(400).json({msg: e.toString()});
        });


    if (flag_reader_cookie === 0 || flag_readers === 0) {
        flag_readers = 1;
        flag_reader_cookie = [req.body.uid];
        HelpArticles.collection.updateOne(
            {_id: mongoose.Types.ObjectId(req.body.category_id)},
            [{
                $set: {
                    readers: flag_readers,
                    reader_cookie: flag_reader_cookie,
                }
            }])

    } else if (flag_reader_cookie.includes(req.body.uid) === false) {
        flag_readers += 1;
        flag_reader_cookie.push(req.body.uid);

        HelpArticles.collection.updateOne(
            {_id: mongoose.Types.ObjectId(req.body.category_id)},
            [{
                $set: {
                    readers: flag_readers,
                    reader_cookie: flag_reader_cookie,
                }
            }]);
    }

    HelpArticles.aggregate([
        {$match: data},
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
        .then(async articleDetails => {
            if (articleDetails.length !== 0) {
                /**
                 * Getting of the category string
                 */
                await HelpCategories
                    .find({})
                    .then(async items => {
                        const temp = items[0].cate;
                        for (const item of Object.keys(temp)) {
                            if (item === articleDetails[0].category_id) {
                                str = {
                                    category: temp[item]
                                };
                                break;
                            }
                        }
                    }).catch(err => {
                        return res.status(400).json({msg: err.toString()});
                    });

                /**
                 * Getting of the first image path
                 */
                let nSearch = '<img src="';
                let src = '';
                if (articleDetails[0]['content'].includes(nSearch)) {
                    let secondSearch = ' alt="undefined"';
                    let n1 = articleDetails[0]['content'].search(nSearch) + 10;
                    src = articleDetails[0]['content'].slice(n1);
                    let n2 = src.search(secondSearch) - 1;
                    src = src.slice(0, n2);
                }

                articleDetails[0]['src'] = src;
                articleDetails[0]['content'] = striptags(articleDetails[0]['content']);
                articleDetails[0]['category_name'] = str.category;
                return res.status(200).json({msg: 'The article details got successfully.', results: articleDetails});
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
    let flag_like = 0;
    let flag_dislike = 0;
    let flag_likers = [];
    let flag_dislikers = [];

    await HelpArticles.findOne({_id: mongoose.Types.ObjectId(req.body.article_id)})
        .then(temp => {
            if (temp.likes) flag_like = temp.likes;
            if (temp.dislikes) flag_dislike = temp.dislikes;
            if (temp.likers) flag_likers = temp.likers;
            if (temp.dislikers) flag_dislikers = temp.dislikers;
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        });

    if (req.body.status === 'like') {
        if (flag_like === 0 || flag_likers === []) {
            flag_like = 1;
            flag_likers = [req.body.uid];
        } else if (flag_likers.includes(req.body.uid) === false) {
            flag_like += 1;
            flag_likers.push(req.body.uid);
        }

        if (flag_dislike !== 0 && flag_dislikers !== []) {
            if (flag_dislikers.includes(req.body.uid) === true) {
                flag_dislike -= 1;
                flag_dislikers.splice(flag_dislikers.indexOf(req.body.uid), 1);
            }
        }
    } else if (req.body.status === 'disLike') {
        if (flag_dislike === 0 || flag_dislikers === []) {
            flag_dislike = 1;
            flag_dislikers = [req.body.uid];
        } else if (flag_dislikers.includes(req.body.uid) === false) {
            flag_dislike += 1;
            flag_dislikers.push(req.body.uid);
        }

        if (flag_like !== 0 && flag_likers !== []) {
            if (flag_likers.includes(req.body.uid) === true) {
                flag_like -= 1;
                flag_likers.splice(flag_likers.indexOf(req.body.uid), 1);
            }
        }
    }

    HelpArticles.collection.updateOne(
        {_id: mongoose.Types.ObjectId(req.body.article_id)},
        [{
            $set: {
                likes: flag_like,
                dislikes: flag_dislike,
                likers: flag_likers,
                dislikers: flag_dislikers,
            }
        }])
        .then(temp => {
            return res.status(200).json({msg: "The like/dislike updated successfully.", results: temp});
        })
        .catch(err => {
            return res.status(400).json({msg: err.toString()});
        });
});

/**
 * Getting the comments by article ID
 * @type {Router}
 */
router.all("/get-comment", async (req, res) => {
    let data = {
        article_id: req.body._id,
    };
    Comments.find(data)
        .then(articleComments => {
            if (articleComments) {
                return res.status(200).json({msg: 'The article details got successfully.', results: articleComments});
            } else {
                return res.status(400).json({msg: 'This article don\'t exist.'});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});
module.exports = router;