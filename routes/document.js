const express = require("express");
const router = express.Router();
const Documents = require("../models/documents");
const Users = require("../models/user");
const mongoose = require('mongoose');
const Config = require('../config');

const multer = require('multer');
const {v4: uuidv4} = require('uuid');

const DIR = "./public/docs";

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, DIR);
    },
    filename: (req, file, cb) => {
        const fileName = file.originalname.toLowerCase().split(' ').join('-');
        cb(null, uuidv4() + '-' + fileName);
    }
});

let upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "application/pdf" || file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || file.mimetype === "text/plain") {
            cb(null, true);
         } else {
             cb(null, false);
             return cb(new Error('Only .pdf, .docx and .txt format allowed.'));
         }
    }
});

let imageUpload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "image/png" || file.mimetype === "image/jpeg" || file.mimetype === "image/jpg") {
            cb(null, true);
        } else {
            cb(null, false);
            return cb(new Error('Only .png, .jpeg and .jpg format allowed.'));
        }
    }
});

let fileUpload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "image/png" || file.mimetype === "image/jpeg" || file.mimetype === "image/jpg" || file.mimetype === "image/gif" || file.mimetype === "image/svg" || file.mimetype === "application/pdf" || file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || file.mimetype === "text/plain") {
            cb(null, true);
        } else {
            cb(null, false);
            return cb(new Error('Only image and document file format allowed.'));
        }
    }
});

router.all("/upload", upload.single('selectedFile'), (req, res, next) => {
    try {
        const fileUrl = Config.SIM_API_URL + 'docs/' + req.file.filename;
        console.log("File Upload Path -> ", fileUrl);
        return res.status(200).json({results: fileUrl});
    } catch (e) {
        return res.status(400).json({results: e.toString()});
    }

});

router.all("/image-upload", imageUpload.single('selectedFile'), (req, res, next) => {
    try {
        const fileUrl = Config.SIM_API_URL + 'docs/' + req.file.filename;
        console.log("File Upload Path -> ", fileUrl);
        return res.status(200).json({results: fileUrl});
    } catch (e) {
        return res.status(400).json({results: e.toString()});
    }
});

router.all("/file-upload", fileUpload.single('selectedFile'), (req, res, next) => {
    try {
        const fileUrl = Config.SIM_API_URL + 'docs/' + req.file.filename;
        console.log("File Upload Path -> ", fileUrl);
        return res.status(200).json({results: fileUrl});
    } catch (e) {
        return res.status(400).json({results: e.toString()});
    }
});

router.all("/share-with", async (req, res) => {
    try {
        /**
         * Membership discrimination
         */
        let discrimination;
        let sQuery;
        if(req.body.role === "client") {
            sQuery = req.body.recipient_id;
        } else {
            sQuery = req.body.sender_id;
        }
        discrimination = await Users.findOne({_id:mongoose.Types.ObjectId(sQuery)});

        let msg;

        if(discrimination.plan_string === undefined) {
            if(req.body.role === "client") {
                msg = "You can not share with this provider."
            } else {
                msg = "Firstly, please create the subscription."
            }
            return res.status(400).json({msg: msg});
        } else {
            if(discrimination.plan_string === "month_individual_basic" || discrimination.plan_string === "year_individual_basic") {
                let msg;
                if(req.body.role === "client") {
                    msg = "You can not share with this provider."
                } else {
                    msg = "You can not share any documentation now. Please upgrade the subscription and try again."
                }

                return res.status(400).json({msg: "You can not share any documentation now. Please upgrade the subscription and try again."})
            }
        }

        const item = await Documents.findOne({
            sender_id: req.body.sender_id,
            recipient_id: req.body.recipient_id,
            path: req.body.path,
        });

        if(item) {
            return res.status(400).json({msg: 'The same document already exit.'});
        } else {
            const newDocuments = await new Documents({
                role: req.body.role,
                sender_id: req.body.sender_id,
                recipient_id: req.body.recipient_id,
                path: req.body.path,
                filename: req.body.filename,
                shared_date: new Date().toUTCString([], {
                    year: 'numeric',
                    month: 'long',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                }),
            });
            await newDocuments.save();
            return res.status(200).json({msg: 'The document uploading succeeded.'});
        }
    } catch (e) {
        return res.status(400).json({msg: e.toString()});
    }
});

router.all("/all-document", async (req, res) => {
    Documents.find({})
        .then(documentList => {
            if(documentList){
                return res.status(200).json({msg: 'The document list stored successfully.', results: [...documentList]});
            } else {
                return res.status(400).json({msg: 'The documents can not find.'});
            }
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        });
});

/**
 * sender -> provider
 * getting recipient -> client
 */
router.all("/document-client-recipient", async (req, res) => {
    Documents.aggregate([
        {
            $lookup:
                {
                    from: 'users',
                    let: {"receiver_id": "$recipient_id"},
                    pipeline: [
                        {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$receiver_id"]}}},
                        {$project: {"name": 1, "email": 1, "photo": 1}}
                    ],
                    as: 'recipient'
                }
        }])
        .then(recipientList => {
            if (recipientList) {
                return res.status(200).json({msg: 'An recipient list stored successfully.', results: [...recipientList]});
            } else {
                return res.status(400).json({msg: 'The documents can not find.'});
            }
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        });
});

/**
 * sender -> client
 * getting recipient -> provider
 */
router.all("/document-client-sender", async (req, res) => {
    Documents.aggregate([
        {
            $lookup:
                {
                    from: 'users',
                    let: {"sender_id": "$sender_id"},
                    pipeline: [
                        {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$sender_id"]}}},
                        {$project: {"name": 1, "email": 1, "photo": 1}}
                    ],
                    as: 'sender'
                }
        }])
        .then(senderList => {
            if (senderList) {
                return res.status(200).json({msg: 'An sender list stored successfully.', results: [...senderList]});
            } else {
                return res.status(400).json({msg: 'The documents can not find.'});
            }
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        });
});

/**
 * sender -> client
 * getting recipient -> provider
 */
router.all("/document-provider-recipient", async (req, res) => {
    Documents.aggregate([
        {
            $lookup:
                {
                    from: 'users',
                    let: {"receiver_id": "$recipient_id"},
                    pipeline: [
                        {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$receiver_id"]}}},
                        {$project: {"name": 1, "email": 1, "photo": 1}}
                    ],
                    as: 'recipient'
                }
        }])
        .then
        (recipientList => {
            if (recipientList) {
                return res.status(200).json({msg: 'An recipient list stored successfully.', results: [...recipientList]});
            } else {
                return res.status(400).json({msg: 'The documents can not find.'});
            }
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        });
});

/**
 * sender -> client
 * getting recipient -> provider
 */
router.all("/document-provider-sender", async (req, res) => {
    Documents.aggregate([
        {
            $lookup:
                {
                    from: 'users',
                    let: {"sender_id": "$sender_id"},
                    pipeline: [
                        {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$sender_id"]}}},
                        {$project: {"name": 1, "email": 1, "photo": 1}}
                    ],
                    as: 'sender'
                }
        }])
        .then(senderList => {
            if (senderList) {
                return res.status(200).json({msg: 'The sender list stored successfully.', results: [...senderList]});
            } else {
                return res.status(400).json({msg: 'The documents can not find.'});
            }
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        });
});

/**
 * getting recipient -> client
 */
router.all("/get-document-one", async (req, res) => {
    const data = {
        $or: [
            {recipient_id: req.body.provider_id, sender_id: req.body.client_id},
            {recipient_id: req.body.client_id, sender_id: req.body.provider_id},
        ]
    };
    Documents.aggregate([
        {$match: data},
        {
            $lookup:
                {
                    from: 'users',
                    let: {"receiver_id": "$recipient_id"},
                    pipeline: [
                        {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$receiver_id"]}}},
                        {$project: {"name": 1, "email": 1, "photo": 1}}
                    ],
                    as: 'recipient'
                }
        }])
        .then(recipientList => {
            if (recipientList) {
                return res.status(200).json({msg: 'An recipient list stored successfully.', results: recipientList});
            } else {
                return res.status(400).json({msg: 'The documents can not find.'});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * getting recipient -> one user
 */
router.all("/shared-with-me", async (req, res) => {
    let data = {
        recipient_id: req.body.id
    };
    let scrapData = {
        from: 'users',
        let: {"receiver_id": "$recipient_id"},
        pipeline: [
            {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$receiver_id"]}}},
            {$project: {"name": 1, "photo": 1}}
        ],
        as: 'recipient'
    };

    Documents.aggregate([
        {$match: data},
        {
            $lookup: scrapData
        }
    ]).collation({locale: 'en', strength: 2})
        .sort({shared_date: -1})
        .limit(10)
        .then(async recipientList => {
            if (recipientList) {
                return res.status(200).json({msg: 'An recipient list stored successfully.', results: [...recipientList]});
            } else {
                return res.status(400).json({msg: 'The documents can not find.'});
            }
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        });
});

module.exports = router;