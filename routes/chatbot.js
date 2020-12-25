const express = require("express");
const router = express.Router();
const mongoose = require('mongoose');
const Chatbot = require("../models/chatbot");
const stringSimilarity = require('string-similarity');

router.all("/add-chatbot", async (req, res) => {
    if(req.body.question === '' || req.body.answer === '') {
        return res.status(400).json({msg: "Please input correctly."})
    } else {
        const temp = await Chatbot.findOne({answer: req.body.answer, origin_question: req.body.question.toLowerCase()});
        if(temp !== null) {
            return res.status(400).json({msg: "The question and the answer exist already."})
        } else {
            let array = [], _array = [];
            let s = req.body.question.toLowerCase().replace(/[\.,:;()?\[\]\n]+/g, "").replace('&nbsp', '');
            array = s.split(' ');
            for (let k = 0; k < array.length; k ++) {
                if(array[k] !== '') {
                    _array.push(array[k]);
                }
            }
            const newChatbot = new Chatbot({
                origin_question: req.body.question.toLowerCase(),
                question: _array,
                answer: req.body.answer,
                add_date: new Date().toUTCString([], {
                    year: 'numeric',
                    month: 'long',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                }),
            });
            await newChatbot.save();
            return res.status(200).json({msg: "The data has added successfully.", results: newChatbot})
        }
    }
});

router.all("/update-chatbot", async (req, res) => {
    const temp = await Chatbot.findOne({_id:mongoose.Types.ObjectId(req.body.id)});
    if(temp === null) {
        return res.status(400).json({msg: "The updating has failed."})
    } else {
        let array = [], _array = [];
        let s = req.body.question.toLowerCase().replace(/[\.,:;()?\[\]\n]+/g, "").replace('&nbsp', '');
        array = s.split(' ');
        for (let k = 0; k < array.length; k ++) {
            if(array[k] !== '') {
                _array.push(array[k]);
            }
        }
        Chatbot.collection.updateOne(
            {_id: mongoose.Types.ObjectId(req.body.id)},
            [{
                $set: {
                    origin_question: req.body.question.toLowerCase(),
                    question: _array,
                    answer: req.body.answer,
                    add_date: new Date().toUTCString([], {
                        year: 'numeric',
                        month: 'long',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                    }),
                }
            }])
            .then(async () => {
                let _temp = await Chatbot.findOne({_id:mongoose.Types.ObjectId(req.body.id)});
                return res.status(200).json({msg: "The data have updated successfully.", results: _temp});
            })
            .catch(err => {
                return res.status(400).json({msg: err.toString()});
            });
    }
});

router.all("/delete-chatbot", async (req, res) => {
    await Chatbot.collection.deleteOne({
        _id: mongoose.Types.ObjectId(req.body.id),
    }).then(() => {
        console.log("The data have deleted successfully.");
        return res.status(200).json({msg: "The data have deleted successfully."});
    }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

router.all("/get-chatbot", async (req, res) => {
    const pagination = req.body.pagination ? parseInt(req.body.pagination) : 10;
    const page_number = req.body.current_page ? parseInt(req.body.current_page) : 1;
    const page_neighbours = req.body.page_neighbours ? parseInt(req.body.page_neighbours) : 1;
    const total_list_count = await Chatbot.countDocuments({});
    const total_page = Math.ceil(total_list_count / pagination);
    const start_page = Math.max(1, page_number - page_neighbours);
    const end_page = Math.min(total_page, page_number + page_neighbours);
    const page_num = {
        start_page: start_page,
        end_page: end_page,
        total_page: total_page,
        num_total: total_list_count,
    };
    Chatbot.find({})
        .collation({locale: 'en', strength: 2})
        .sort({add_date: 1})
        .skip((page_number - 1) * pagination)
        .limit(pagination)
        .then( item => {
            const result = {
                list: item,
                page_num: page_num,
            };
            return res.status(200).json({results: result});
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    })
});

/**
 * Learning Bot
 * @type {Router}
 */
router.all("/learn-chatbot", async (req, res) => {
    console.log(req.body);
    let message = req.body.message.replace(/[\.,:;()?\[\]\n]+/g, "").replace('&nbsp', '');
    let array = [];
    let question_array = [];
    let reply = "I can't find an answer to your question.";
    let flag = 4;

    array = message.split(' ');
    for (let k = 0; k < array.length; k ++) {
        if(array[k] !== '') {
            question_array.push(array[k]);
        }
    }

    if(question_array.indexOf("hello") !== -1 || question_array.indexOf("hi") !== -1 || question_array.indexOf("hey") !== -1) {
        flag = 0;
    } else if(question_array.indexOf("subscription") !== -1 || question_array.indexOf("pricing") !== -1) {
        flag = 1;
    } else if(question_array.indexOf("train") !== -1 || question_array.indexOf("training") !== -1) {
        flag = 2;
    } else if(question_array.indexOf("technical") !== -1 || question_array.indexOf("support") !== -1) {
        flag = 3;
    } else {
        let questionsArray = [];
        let answerArray = [];
        await Chatbot.find({}, ["-add_date", "-_id", "-question", "-__v"])
            .then(items => {
                if(items) {
                    for (let i = 0; i < items.length; i ++) {
                        questionsArray.push(items[i].origin_question);
                        answerArray.push(items[i].answer);
                    }
                }
            }).catch(err => {
                return res.status(400).json({msg: err.toString()});
            });

        let matches = stringSimilarity.findBestMatch(req.body.message, questionsArray);
        let index = matches.bestMatchIndex;
        let rating = matches.bestMatch.rating;
        if (rating > 0.4) {
            console.log(index);
            reply = answerArray[index];
        }
//       console.log(req.body.message, questionsArray, matches, answerArray[matches.bestMatchIndex]);
        console.log(questionsArray, matches);
        console.log("reply = ", reply);
    }

    const result = {
        flag: flag,
        reply: reply,
    };
    return res.status(200).json({results: result});
});
module.exports = router;