const express = require("express");
const router = express.Router();
const mongoose = require('mongoose');
const Messages = require("../models/messages");
const Users = require("../models/user");
const striptags = require('striptags');

router.all("/register-message", async (req, res) => {
    /**
     * limit_number: limit count can store to the database
     */
    const limit_number = 10;
    const temp = await Messages.find({
        $or: [
            {sender_id: req.body.sender_id, recipient_id: req.body.recipient_id},
            {sender_id: req.body.recipient_id, recipient_id: req.body.sender_id},
        ]}).sort({messageDate: 1});

    if(temp.length >= limit_number) {
        await Messages.collection.deleteOne({
            _id: mongoose.Types.ObjectId(temp[0]._id),
        });
    }

    const newMessages = await new Messages({
        sender_id: req.body.sender_id,
        recipient_id: req.body.recipient_id,
        message: req.body.message,
        messageDate: new Date().toLocaleString([], {
            year: 'numeric',
            month: 'long',
            day: '2-digit',
            hour: "numeric",
            minute: "numeric",
        }),
    });

    newMessages.save()
        .then(item => {
            return res.status(200).json({msg: 'The message registered successfully.'});
        }).catch(err => {
        return res.status(400).json({msg: err.toString()})
    });
});

router.all("/get-messages", async (req, res) => {
    console.log(req.body);
    let temp1 = await Users.findOne({_id: mongoose.Types.ObjectId(req.body.id1)});
    const user1 = {
        name: temp1.name,
        photo: temp1.photo,
    };

    let temp2 = await Users.findOne({_id: mongoose.Types.ObjectId(req.body.id2)});
    const user2 = {
        name: temp2.name,
        photo: temp2.photo,
    };

    Messages.find({
        $or: [
            {sender_id: req.body.id1, recipient_id: req.body.id2},
            {sender_id: req.body.id2, recipient_id: req.body.id1},
        ]})
        .then(async item => {
            const data = { user1, user2, item };
            return res.status(200).json({msg: 'The connected clients list got successfully.', results: data});
        }).catch(err => {
        return res.status(400).json({msg: err.toString()})
    })
});

router.all("/get-clients", async (req, res) => {
    let idList = [];
    let results = [];
    Messages.find({
        $or: [
            {sender_id: req.body.id},
            {recipient_id: req.body.id},
        ]}, ["-message", "-messageDate", "-_id"])
        .sort({messageDate: -1})
        .then(async items => {
            for (let k = 0; k < items.length; k ++) {
                let str = items[k].sender_id + items[k].recipient_id;
                str = str.replace(req.body.id, '');
                idList.push(str);
                idList = [...new Set(idList)];
            }

            for (let k = 0; k < idList.length; k ++) {
                let temp = await Users.findOne({
                    _id: mongoose.Types.ObjectId(idList[k]),
                    $and: [{deleted_date: null}],
                });
                if(temp) {
                    const sResult = {
                        name: temp.name,
                        id: idList[k],
                    };

                    results.push(sResult);
                }
            }
            return res.status(200).json({msg: 'The connected clients list got successfully.', results: results});
        }).catch(err => {
        return res.status(400).json({msg: err.toString()})
    })
});

router.all("/delete-message", async (req, res) => {
    Messages.collection.deleteOne({
        _id: mongoose.Types.ObjectId(req.body.id),
    }).then(item => {
        return res.status(200).json({msg: 'The message deleted successfully.'});
    }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});


router.all("/get-edit-message", async (req, res) => {
    Messages.findOne({_id: mongoose.Types.ObjectId(req.body.id)})
        .then(item => {
            return res.status(200).json({msg: 'The message got successfully.', results: item});
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

router.all("/update-message", async (req, res) => {
    Messages.findOne({_id: mongoose.Types.ObjectId(req.body.id)})
        .then(item => {
            Messages.updateOne(
                {_id: mongoose.Types.ObjectId(req.body.id)},
                [{
                    $set: {
                        message: req.body.message,
                        messageDate: new Date().toLocaleString([], {
                            year: 'numeric',
                            month: 'long',
                            day: '2-digit',
                            hour: "numeric",
                            minute: "numeric",
                        }),
                    }
                }])
                .then(() => {
                    return res.status(200).json({msg: 'The message got successfully.', results: item});
                }).catch(err => {
                return res.status(400).json({msg: err.toString()})
            });
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
    });
});

router.all("/get-last-messages", async (req, res) => {
    let idList = [];
    let results = [];
    let lastMessages = [];

    const pagination = req.body.message_pagination ? parseInt(req.body.message_pagination) : 10;
    const page_number = req.body.message_current_page ? parseInt(req.body.message_current_page) : 1;
    const page_neighbours = req.body.message_page_neighbours ? parseInt(req.body.message_page_neighbours) : 1;

    const total_list_count = await Messages.find({
        $or: [
            {sender_id: req.body.id},
            {recipient_id: req.body.id},
        ]})
        .sort({messageDate: 1})
        .then(async items => {
            for (let k = 0; k < items.length; k ++) {
                let str = items[k].sender_id + items[k].recipient_id;
                str = str.replace(req.body.id, '');
                lastMessages[str] = items[k];
                idList.push(str);
                idList = [...new Set(idList)];
            }

            for (let k = 0; k < idList.length; k ++) {
                let temp = await Users.findOne({
                    _id: mongoose.Types.ObjectId(idList[k]),
                    $and: [{deleted_date: null}],
                });

                if(temp) {
                    const sResult = {
                        id: idList[k],
                        name: temp.name,
                        photo: temp.photo,
                        msg: lastMessages[idList[k]].message.length > 30?
                            lastMessages[idList[k]].message.slice(0, 29) + "..."
                            :
                            lastMessages[idList[k]].message,
                        date: lastMessages[idList[k]].messageDate,
                    };
                    results.push(sResult);
                }
            }
            return results;
        }).catch(err => {
            return res.status(400).json({msg: err.toString()})
        });

    const total_page = Math.ceil(total_list_count.length / pagination);
    const start_page = Math.max(1, page_number - page_neighbours);
    const end_page = Math.min(total_page, page_number + page_neighbours);

    const page_num = {
        start_page: start_page,
        end_page: end_page,
        total_page: total_page,
    };

    let list_array = [];
    for (let k = (req.body.message_current_page - 1) * req.body.message_pagination; k < req.body.message_current_page * req.body.message_pagination; k ++) {
        if(total_list_count[k]) list_array.push(total_list_count[k]);
    }
    const final_results = {
        list: list_array,
        page_num: page_num,
    };
    return res.status(200).json({msg: 'The last message list with connected clients got successfully.', results: final_results});
});

/**
 * Message list with the one client
 */

router.all("/get-message-one", async (req, res) => {
    await Messages.find({
        $or: [
            {sender_id: req.body.provider_id, recipient_id: req.body.client_id},
            {sender_id: req.body.client_id, recipient_id: req.body.provider_id},
        ]})
        .sort({messageDate: -1})
        .limit(1)
        .then(async items => {
            return res.status(200).json({results: items});
        }).catch(err => {
            return res.status(400).json({msg: err.toString()})
        });
});
module.exports = router;