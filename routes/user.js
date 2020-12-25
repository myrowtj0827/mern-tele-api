const express = require("express");
const router = express.Router();
const mongoose = require('mongoose');

const Users = require("../models/user");
const RequestProvider = require("../models/request-provider");
const RequestClient = require("../models/request-client");
const Config = require("../config");
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const stripe = require('stripe')(Config.STRIPE_SK);

/**
 *
 * Provider Registration
 *
 */
async function nodemailerCreate() {
    return nodemailer.createTransport(Config.MAIL_CONFIG);

    // return nodemailer.createTransport(sgTransport({
    //     auth: {
    //         api_key: Config.MAIL_SG_API,
    //     }
    // }));
}
router.all("/register-provider", async (req, res) => {
    if (req.body.practice_name === '' || req.body.name === '' || req.body.email === '' || req.body.password === '' || req.body.confirm_password === 0) {
        return res.status(400).json({msg: 'Please fill the whole input fields.'});
    } else {
        if (req.body.email.includes("@") === false || req.body.email.includes(".") === false) {
            return res.status(400).json({msg: 'Please input the valid email.'});
        } else {
            if (req.body.password !== req.body.confirm_password) {
                return res.status(400).json({msg: 'Please input the confirm password correctly.'});
            } else {
                let items = await RequestProvider.findOne({email: req.body.email});
                let sTemp;
                if (req.body.add_role !== 'provider') {
                    if (items) {
                        return res.status(400).json({msg: 'The request email already exists. Please check your mailbox.'});
                    }
                }
                sTemp = {
                    email: req.body.email,
                    "role": {$elemMatch: {$eq: "provider"}}
                };
                let item = await Users.findOne(sTemp);
                if (item) {
                    return res.status(400).json({msg: 'The registered provider email already exists. Please try by the other email.'});
                }

                let mailOptions, transporter;
                if (req.body.add_role !== 'provider') {
                    const newRequestProvider = new RequestProvider({
                        main_provider_id: req.body.add_role === 'provider' && req.body.provider_id,
                        name: req.body.name.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                        email: req.body.email,
                        practice_name: req.body.practice_name.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                        password: req.body.password,
                        loggedIn_state: false,
                    });

                    await newRequestProvider.save();
                    const temp = await RequestProvider.findOne({email: req.body.email});
                    let path = Config.PROVIDER_URL + '/success-verification/' + temp._id;
                    mailOptions = {
                        from: Config.MAIL_SENDER,
                        to: temp.email,

                        subject: 'TeleTherapist: Email address verification',
                        html: req.body.add_role === 'provider' ?
                            `<p>To verify your email address as provider account, click <a href='${path}'>here</a>.</p><p>You can use "${req.body.password}" as the password.</p>`
                            :
                            `<p>To verify your email address as provider account, click <a href='${path}'>here</a>.</p>`,
                    };
                } else {
                    /**
                     * Membership discrimination
                     */
                    const discrimination = await Users.findOne({_id:mongoose.Types.ObjectId(req.body.provider_id)});
                    if(discrimination.plan_string === undefined) {
                        return res.status(400).json({msg: "Firstly, please create the subscription."})
                    } else {
                        if(discrimination.plan_string === "month_individual_basic" || discrimination.plan_string === "year_individual_basic") {
                            const limit = 1;
                            let nCount = await Users.collection.countDocuments({main_provider_id: req.body.provider_id});
                            if(nCount >= limit) {
                                return res.status(400).json({msg: "You have already invited the provider more than one this month. Please upgrade the subscription and try again."})
                            }
                        }
                    }

                    const items = await Users.findOne({email: req.body.email});
                    if (items) {
                        if (items.role.includes('provider') === true) {
                            return res.status(400).json({msg: 'The registered provider email already exists. Please try by the other email.'});
                        } else if (items.role.includes('client') === true) {
                            await Users.collection.updateOne(
                                {_id: mongoose.Types.ObjectId(items._id),},
                                {
                                    $push: {
                                        role: 'provider',
                                    },
                                    $set: {
                                        main_provider_id: req.body.provider_id,
                                    },
                                });
                            return res.status(400).json({msg: 'You has invited the user as the provider successfully.'});
                        }
                    } else {
                        const newUsers = new Users({
                            main_provider_id: req.body.provider_id,
                            role: ['provider'],
                            name: req.body.name.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                            email: req.body.email,
                            practice_name: req.body.practice_name.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                            password: req.body.password,
                            phone: req.body.phone,
                            country: '',
                            loggedIn_state: false,
                            registered_date: new Date().toLocaleDateString([], {
                                year: 'numeric',
                                month: 'long',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                            }),
                        });

                        await newUsers.save();
                    }

                    let path = Config.PROVIDER_URL + '/login';
                    mailOptions = {
                        from: Config.MAIL_SENDER,
                        to: req.body.email,

                        subject: 'TeleTherapist: Invite',
                        html: `<p>${req.body.provider_name} had invited you as the provider.<br /> Please click <a href='${path}'>here</a> and login. The password is ${req.body.password}. After logged in, you can change the password.</p>`,
                    };
                }

                transporter = await nodemailerCreate();
                await transporter.sendMail(mailOptions, function (error, info) {
                    if (error) {
                        return res.status(400).json({msg: error.toString()});
                    } else {
                        return res.status(200).json({msg: "An email sent. Please check your mailbox."});
                    }
                });
            }
        }
    }
});

router.all("/get-request-provider", async (req, res) => {
    RequestProvider.findOne({_id: mongoose.Types.ObjectId(req.body.id)})
        .then(requestProvider => {
            if (requestProvider) {
                return res.status(200).json({
                    msg: 'The provider request list has got successfully.',
                    results: requestProvider
                });
            } else {
                return res.status(400).json({msg: 'The provider requests can not find.'});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

router.all("/verification", async (req, res) => {
    let temp = await Users.findOne({email: req.body.email});

    if (temp) {
        temp.role.push('provider');
        Users.collection.updateOne({email: req.body.email},
            [{
                $set: {
                    main_provider_id: req.body.main_provider_id,
                    password: req.body.password,
                    role: temp.role,
                    name: req.body.name.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                    practice_name: req.body.practice_name.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                }
            }]).then(() => {
            return res.status(200).json({msg: 'The email has verified successfully.'});
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        });

        temp = await RequestProvider.findOne({email: req.body.email});
        await RequestProvider.collection.deleteOne({
            _id: mongoose.Types.ObjectId(temp._id),
        });
    } else {
        temp = await RequestProvider.findOne({email: req.body.email});
        const newUsers = new Users({
            main_provider_id: req.body.main_provider_id,
            role: ['provider'],
            name: temp.name.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
            email: temp.email,
            practice_name: temp.practice_name.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
            password: temp.password,
            country: '',
            loggedIn_state: false,
            registered_date: new Date().toLocaleDateString([], {
                year: 'numeric',
                month: 'long',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            }),
        });

        await newUsers.save();
        temp = await RequestProvider.findOne({email: req.body.email});
        await RequestProvider.collection.deleteOne({
            _id: mongoose.Types.ObjectId(temp._id),
        });
        return res.status(200).json({msg: 'The provider request has verified.', results: temp});
    }
});

/**
 *
 * Client Registration
 *
 */
router.all("/request-client", async (req, res) => {
    if (req.body.name === '') {
        if (req.body.email === '') {
            return res.status(400).json({msg: 'Please input your name and email.'});
        } else {
            if (req.body.email.includes('@') === false || req.body.email.includes('.') === false) {
                return res.status(400).json({msg: 'Please input your name and valid email.'});
            } else {
                return res.status(400).json({msg: 'Please input your name.'});
            }
        }
    } else {
        if (req.body.email === '') {
            return res.status(400).json({msg: 'Please input your email.'});
        } else {
            if (req.body.email.includes('@') === false || req.body.email.includes('.') === false) {
                return res.status(400).json({msg: 'Please input valid email.'});
            }
            const items = await Users.findOne({
                email: req.body.email,
                "role": {$elemMatch: {$eq: "client"}},
            }, ["-photo"]);
            if (items) {
                // as the registered client
                // repeated request
                let sTemp = await RequestClient.findOne({
                    client_email: req.body.email,
                    provider_id: req.body.provider_id,
                });

                if (sTemp) {
                    return res.status(400).json({
                        msg: "You have already sent the request to " + req.body.provider_name + ".",
                    });
                }

                let temp = items.provider_ids.includes(req.body.provider_id);
                if (temp === true) {
                    // the request of the connected case with the provider
                    return res.status(400).json({
                        msg: "You already have registered by using the email and connected with " + req.body.provider_name + ".",
                    });
                } else {

                    // the first request to the pointed out provider in the existed client
                    const newRequestClient = new RequestClient({
                        client_name: req.body.name.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                        client_email: req.body.email,
                        provider_id: req.body.provider_id,
                        provider_name: req.body.provider_name.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                        provider_email: req.body.provider_email,
                        msg: req.body.msg,
                        request_date: new Date().toLocaleDateString([], {
                            year: 'numeric',
                            month: 'long',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                        }),
                        contact: true,
                    });
                    await newRequestClient.save();
                    return res.status(400).json({
                        msg: "You have already registered by using the email and we sent to " + req.body.provider_name + "your contact request",
                    });
                }
            }

            // in the un-registered client case
            const item = await RequestClient.findOne({client_email: req.body.email});
            if (item) {
                return res.status(200).json({
                    msg: 'You have already requested by using the email. Please check your mailbox. If the provider did not accept yet, there is no message you received.'
                });
            }

            const newRequestClient = new RequestClient({
                client_name: req.body.name.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                client_email: req.body.email,
                provider_id: req.body.provider_id,
                provider_name: req.body.provider_name.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                provider_email: req.body.provider_email,
                msg: req.body.msg,
                request_date: new Date().toLocaleDateString([], {
                    year: 'numeric',
                    month: 'long',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                }),
            });
            await newRequestClient.save();
            return res.status(200).json({msg: 'Your registration has succeed.'});
        }
    }
});


// *** Completing
router.all("/accept-request", async (req, res) => {
    let requestData;
    let flag = false;
    if (req.body.add_role === 'client') {
        if (req.body.name === '') {
            if (req.body.email === '') {
                return res.status(400).json({msg: 'Please input name and email.'});
            } else {
                if (req.body.email.includes('@') === false || req.body.email.includes('.') === false) {
                    return res.status(400).json({msg: 'Please input name and valid email.'});
                } else {
                    return res.status(400).json({msg: 'Please input name.'});
                }
            }
        } else {
            if (req.body.email === '') {
                return res.status(400).json({msg: 'Please input email.'});
            } else {
                if (req.body.email.includes('@') === false || req.body.email.includes('.') === false) {
                    return res.status(400).json({msg: 'Please input valid email.'});
                }
                //const items = await Users.findOne({email: req.body.email, "role": {$elemMatch: {$eq: "client"}},});
                const items = await Users.findOne({email: req.body.email});
                if (items && items.deleted_date && items.deleted_date !== false) {
                    return res.status(400).json({msg: 'The user has already deleted. Please add the other user.'});
                }

                if (items) {
                    if (items.role.includes('provider') === true && items.role.includes('client') === true) {
                        //    already existing as the provider, client
                        if (items.provider_ids.includes(req.body.provider_id) === true) {
                            return res.status(200).json({msg: "You have already connected with the client."})
                        } else {
                            await Users.collection.updateOne(
                                {_id: mongoose.Types.ObjectId(req.body.provider_id),},
                                {
                                    $push: {client_ids: items._id.toString()},
                                });
                            await Users.collection.updateOne(
                                {_id: mongoose.Types.ObjectId(items._id),},
                                {
                                    $push: {provider_ids: req.body.provider_id.toString()},
                                });
                            return res.status(200).json({msg: "You just have connected with the client."})
                        }
                    } else if (items.role.includes('provider') === true) {
                        //    already existing as the provider only
                        await Users.collection.updateOne(
                            {_id: mongoose.Types.ObjectId(req.body.provider_id),},
                            {
                                $push: {client_ids: items._id.toString()},
                            });

                        await Users.collection.updateOne(
                            {_id: mongoose.Types.ObjectId(items._id),},
                            {
                                $push: {
                                    provider_ids: req.body.provider_id.toString(),
                                    role: 'client',
                                },
                            });
                        return res.status(200).json({msg: "You just have connected with the client."})
                    } else if (items.role.includes('client') === true) {
                        if (items.provider_ids.includes(req.body.provider_id) === true) {
                            return res.status(200).json({msg: "You have already connected with the client."})
                        } else {
                            await Users.collection.updateOne(
                                {_id: mongoose.Types.ObjectId(req.body.provider_id),},
                                {
                                    $push: {client_ids: items._id.toString()},
                                });
                            await Users.collection.updateOne(
                                {_id: mongoose.Types.ObjectId(items._id),},
                                {
                                    $push: {provider_ids: req.body.provider_id.toString()},
                                });
                            return res.status(200).json({msg: "You just have connected with the client."})
                        }
                    }
                } else {
                    const newUsers = new Users({
                        role: ['client'],
                        provider_ids: [req.body.provider_id],
                        name: req.body.name.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                        email: req.body.email,
                        phone: req.body.phone,
                        password: req.body.password,
                        loggedIn_state: false,
                        country: '',
                        registered_date: new Date().toLocaleDateString([], {
                            year: 'numeric',
                            month: 'long',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                        }),
                    });
                    await newUsers.save();

                    let temp = await Users.findOne({email: req.body.email,});
                    await Users.collection.updateOne(
                        {_id: mongoose.Types.ObjectId(req.body.provider_id),},
                        {
                            $push: {client_ids: temp._id.toString()},
                        });
                }
                flag = true;
            }
        }
    } else {
        requestData = req.body; //JSON.parse(req.query.data); // registration by client oneself
    }

    let transporter = await nodemailerCreate();

    let path;
    let mailOptions;

    if (flag === true) {
        path = Config.CLIENT_URL + '/client-login';
        mailOptions = {
            from: Config.MAIL_SENDER,
            to: req.body.email,

            subject: 'TeleTherapist: Invite',
            html: `<p>${req.body.provider_name} had invited you.<br /> Please click <a href='${path}'>here</a> and login. The password is ${req.body.password}. After logged in, you can change the password.</p>`,
        };

    } else {
        path = Config.CLIENT_URL + '/register-client/' + requestData._id;
        mailOptions = {
            from: Config.MAIL_SENDER,
            to: requestData.client_email,

            subject: 'TeleTherapist: Request to register',
            html: `<p>${requestData.provider_name} has accepted your registration request.<br /> Please click <a href='${path}'>here</a> and register personal information.</p>`,
        };
        RequestClient.collection.updateOne({_id: mongoose.Types.ObjectId(requestData._id)}, [{$set: {accept_state: 'true'}}]).then(() => {
        });
    }

    transporter.sendMail(mailOptions, async function (error, info) {
        if (error) {
            console.log(error);
            return res.status(400).json({msg: error.toString()});
        } else {
            return res.status(200).json({msg: "Your invitation has succeed."});
        }
    });
});

router.all("/register-client", async (req, res) => {
    if (req.body.password === '' && req.body.confirm_password === '') {
        return res.status(400).json({msg: 'Please input the password and the confirm password.'});
    } else {
        if (req.body.password === '') {
            return res.status(400).json({msg: 'Please input the password'});
        } else if (req.body.confirm_password === '') {
            return res.status(400).json({msg: 'Please input the confirm password'});
        } else {
            if (req.body.confirm_password !== req.body.password) {
                return res.status(400).json({msg: 'Please input the confirm password correctly.'});
            } else {
                if (req.body.accept_state === false) {
                    return res.status(400).json({msg: 'Please accept on the terms of service.'});
                } else {
                    let item = await Users.findOne({email: req.body.email});

                    if (item) {
                        item.role.push('client');
                        let temp = [req.body.provider_id];

                        Users.collection.updateOne({email: req.body.email},
                            [{
                                $set: {
                                    provider_ids: temp,
                                    password: req.body.password,
                                    role: item.role,
                                    //name: req.body.name.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                                }
                            }]).then(() => {
                            RequestClient.collection.deleteOne({
                                _id: mongoose.Types.ObjectId(req.body.request_id),
                            });
                            return res.status(200).json({msg: 'You have already registered by using this email as the provider. The profile has updated successfully by this information.'});
                        }).catch(err => {
                            return res.status(400).json({msg: err.toString()});
                        });
                    } else {
                        // the first registration as client
                        const newUsers = new Users({
                            role: ['client'],
                            provider_ids: [req.body.provider_id],
                            name: req.body.name.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                            email: req.body.email,
                            password: req.body.password,
                            country: '',
                            loggedIn_state: false,
                            registered_date: new Date().toLocaleDateString([], {
                                year: 'numeric',
                                month: 'long',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                            }),
                        });
                        await newUsers.save();
                        const added_client = await Users.findOne({
                            email: req.body.email,
                        });

                        await Users.collection.updateOne(
                            {_id: mongoose.Types.ObjectId(req.body.provider_id),},
                            {
                                $push: {client_ids: added_client._id.toString()},
                            });

                        await RequestClient.collection.deleteOne({
                            _id: mongoose.Types.ObjectId(req.body.request_id),
                        });

                        return res.status(200).json({msg: 'The client registration has succeed.'});
                    }
                }
            }
        }
    }
});

router.all("/get-request", async (req, res) => {
    await RequestClient.find({_id: mongoose.Types.ObjectId(req.body.id)}).then
    (requestInfo => {
        if (requestInfo) {
            return res.status(200).json({msg: 'The client request info has got successfully.', results: requestInfo});
        } else {
            return res.status(400).json({msg: 'The client requests can not find.'});
        }
    });
});

router.all("/all-client-request", async (req, res) => {
    let data = {
        provider_id: req.body.user_id,
    };

    const pagination = req.body.pagination ? parseInt(req.body.pagination) : 10;
    const page_number = req.body.current_page ? parseInt(req.body.current_page) : 1;
    const page_neighbours = req.body.page_neighbours ? parseInt(req.body.page_neighbours) : 1;

    const total_list_count = await RequestClient.collection.countDocuments(data);
    const total_page = Math.ceil(total_list_count / pagination);

    const start_page = Math.max(1, page_number - page_neighbours);
    const end_page = Math.min(total_page, page_number + page_neighbours);
    const page_num = {
        start_page: start_page,
        end_page: end_page,
        total_page: total_page,
    };

    RequestClient.aggregate([
        {$match: data},
    ])
        .collation({locale: 'en', strength: 2})
        .sort({name: -1})
        .skip((page_number - 1) * pagination)
        .limit(pagination)
        .then(requestInfo => {
            if (requestInfo) {
                const result = {
                    list: requestInfo,
                    page_num: page_num,
                };
                return res.status(200).json({msg: 'The client request info has got successfully.', results: result});
            } else {
                return res.status(400).json({msg: 'The client requests can not find.'});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

router.all("/delete-request", async (req, res) => {
    let deleteData = JSON.parse(req.query.deleteData);
    await RequestClient.collection.deleteOne({
        _id: mongoose.Types.ObjectId(deleteData._id),
    });
    return res.status(200).json({msg: "This request has deleted successfully."});
});

/**
 * Common api
 */
router.all("/login", async (req, res) => {
    if (req.body.email === '' || req.body.password === '') {
        return res.status(400).json({msg: "Please fill the whole fields."})
    } else if (req.body.email.includes("@") === false || req.body.email.includes(".") === false) {
        return res.status(400).json({msg: "Please input the valid email."})
    }

    Users.findOne({
        role: {$elemMatch: {$eq: req.body.role}},
        email: req.body.email,
        password: req.body.password,
    }, ["-password", "-photo", "-loggedIn_state", "-phone", "-updated_date", "-bgPhoto", "-bigPhoto", "-address1", "-address2",
        "-city", "-state_province", "-zip_code", "-country", "-about", "-cost", "-license_info", "-loggedIn_state", "-bgMusic", "-bgRoom", "-expertise",])
        .then(sItem => {
            if (sItem) {
                return res.status(200).json({msg: 'The login has succeed.', results: sItem});
            } else {
                return res.status(400).json({msg: 'The login has failed. Please try again.'});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Common api
 */
router.all("/logout", async (req, res) => {
    Users.collection.updateOne({
        _id: mongoose.Types.ObjectId(req.body.id),
        role: {$elemMatch: {$eq: req.body.role}}
    }, [{$set: {loggedIn_state: false}}])
        .then(() => {
            return res.status(200).json({msg: 'The logout has succeed.'});
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Forgot Password
 */
router.all("/forgot-password", async (req, res) => {
    try {
        if (req.body.email === '') {
            return res.status(400).json({msg: "Please input the email."})
        } else if (req.body.email.includes("@") === false || req.body.email.includes(".") === false) {
            return res.status(400).json({msg: "Please input the email correctly."})
        }
        const sItem = await Users.findOne({
            email: req.body.email,
            role: {$elemMatch: {$eq: req.body.role}},
        }, ["-password"]);

        if (sItem) {
            let path;
            if (req.body.role === 'provider') {
                path = Config.PROVIDER_URL + '/reset-password/' + sItem._id;
            } else {
                path = Config.CLIENT_URL + '/reset-password/' + sItem._id;
            }

            let mailOptions = {
                from: Config.MAIL_SENDER,
                to: sItem.email,

                subject: 'TeleTherapist: Request to reset the password',
                html: `<p>We have accepted your reset password request.<br /> Please click <a href='${path}'>here</a> and reset password.</p>`,
            };

            let transporter = await nodemailerCreate();
            transporter.sendMail(mailOptions, function (error, info) {
                if (error) {
                    return res.status(400).json({msg: error.toString()});
                } else {
                    return res.status(200).json({
                        msg: "Your email has sent successfully. Please check your mailbox.",
                        results: sItem,
                    });
                }
            });
        } else {
            return res.status(400).json({msg: 'You did not register by using this email.'});
        }
    } catch (e) {
        return res.status(400).json({msg: e.toString()});
    }
});

/**
 * Reset Password
 */
router.all("/reset-password", async (req, res) => {
    if (req.body.flag === 'profile') {
        if (req.body.password === '' || req.body.new_password === '' || req.body.confirm_password === '') {
            return res.status(400).json({msg: 'Please fill the whole fields.'});
        } else {
            await Users.findOne({
                _id: mongoose.Types.ObjectId(req.body.id),
                role: {$elemMatch: {$eq: req.body.role}},
            }).then
            (user => {
                if (user) {
                    if (user.password !== req.body.password) {
                        return res.status(400).json({msg: 'Please input the current password correctly.'});
                    } else {
                        if (req.body.new_password !== req.body.confirm_password) {
                            return res.status(400).json({msg: 'Please fill the confirm password correctly.'});
                        } else {
                            Users.collection.updateOne({
                                _id: mongoose.Types.ObjectId(req.body.id),
                                role: {$elemMatch: {$eq: req.body.role}}
                            }, [{$set: {password: req.body.new_password}}]).then(() => {
                            }).then(() => {
                                return res.status(200).json({msg: 'The password reset successfully.'});
                            }).catch(err => {
                                return res.status(400).json({msg: err.toString()});
                            });
                        }
                    }

                } else {
                    return res.status(400).json({msg: 'The user can not find.'});
                }
            });
        }
    } else {
        if (req.body.new_password === '' || req.body.confirm_password === '') {
            return res.status(400).json({msg: 'Please fill the whole fields.'});
        } else if (req.body.new_password !== req.body.confirm_password) {
            return res.status(400).json({msg: 'Please fill the confirm password correctly.'});
        } else {
            Users.collection.updateOne({
                _id: mongoose.Types.ObjectId(req.body.id),
                role: {$elemMatch: {$eq: req.body.role}},
            }, [{$set: {password: req.body.new_password}}]).then(() => {
            }).then(() => {
                return res.status(200).json({msg: 'The password has reset successfully.'});
            }).catch(err => {
                return res.status(400).json({msg: err.toString()});
            });
        }
    }
});

/**
 * Accept terms and conditions
 */
router.all("/accept-terms", async (req, res) => {
   await Users.updateOne({
       _id: mongoose.Types.ObjectId(req.body.id),
       role: {$elemMatch: {$eq: req.body.role}},
   },
       {
           $set: {
               first_login: 1,
           }
       })
       .then(() => {
           return res.status(200).json({msg: "You have accept on the terms and conditions of teletherapist"})
       })
       .catch(err => {
           return res.status(400).json({msg: err.toString()});
       })
});
/**
 * Common api
 * Only ID, Email, and Name of the User ID and role
 */
router.all("/get-simple-user", async (req, res) => {
    Users.findOne({
        _id: mongoose.Types.ObjectId(req.body.id),
        role: {$elemMatch: {$eq: req.body.role}},
    }, ["-password", "-loggedIn_state", "-updated_date", "-bgPhoto", "-bigPhoto", "-address1", "-address2",
        "-city", "-state_province", "-zip_code", "-country", "-about", "-cost", "-license_info", "-loggedIn_state", "-bgMusic", "-bgRoom", "-expertise",])
        .then(accountSimpleInfo => {
            if (accountSimpleInfo) {
                return res.status(200).json({msg: 'The user info has got successfully.', results: accountSimpleInfo});
            } else {
                return res.status(200).json({msg: 'Such user can not find.', results: 'database initialize'});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Common api
 * Only ID, Email, Name, and photo according to the User ID and role
 */
router.all("/get-photo-user", async (req, res) => {
    await Users.findOne({
        _id: mongoose.Types.ObjectId(req.body.id),
        role: {$elemMatch: {$eq: req.body.role}},
    }, ["-password", "-loggedIn_state", "-phone", "-updated_date", "-bgPhoto", "-bigPhoto", "-address1", "-address2",
        "-city", "-state_province", "-zip_code", "-country", "-about", "-cost", "-license_info", "-loggedIn_state", "-expertise",])
        .then(async userPhotoInfo => {
            if (userPhotoInfo) {
                if(req.body.role === 'client') {
                    let ids = userPhotoInfo.provider_ids;
                    console.log(ids, "&&&&&&&&&&&&&&")
                    let practice_names = [];
                    for (let k = 0; k < ids.length; k ++) {
                        let user = await Users.findOne({
                            _id: mongoose.Types.ObjectId(ids[k]),
                            role: {$elemMatch: {$eq: 'provider'}},
                        });
                        practice_names.push(user.practice_name);
                    }
                    userPhotoInfo.practice_name = JSON.stringify(practice_names);
                    return res.status(200).json({msg: 'The user info has got successfully.', results: userPhotoInfo});
                } else {
                    return res.status(200).json({msg: 'The user info has got successfully.', results: userPhotoInfo});
                }
            } else {
                return res.status(200).json({msg: 'Such user can not find.', results: userPhotoInfo});
            }
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        });
});

/**
 * Full Person information of the User ID
 */
router.all("/get-info-user", async (req, res) => {
    Users.findOne({_id: mongoose.Types.ObjectId(req.body.id), role: {$elemMatch: {$eq: req.body.role}},}, ["-password"])
        .then(userFullInfo => {
            if (userFullInfo) {
                return res.status(200).json({msg: 'The user information has got successfully.', results: userFullInfo});
            } else {
                return res.status(400).json({msg: 'The user can not find.'});
            }
        })
        .catch(err => (
            res.status(400).json({msg: err.toString()})
        ));
});

/**
 * User Profile Update
 */
router.all("/user-profile", async (req, res) => {
    console.log(req.body,  " ===================================================== ");

    let email_temp = req.body.email && req.body.email.includes('@') && req.body.email.includes('.');
    if(email_temp === false){
        return res.status(400).json({msg: "Please input the correct email."})
    }

    let temp = {
        email: req.body.email,
        $nor: [{_id: mongoose.Types.ObjectId(req.body.id)}],
    };

    temp = await Users.aggregate([
        {$match: temp},
    ]);

    if (temp.length !== 0) {
        return res.status(400).json({msg: "The same email already exit."});
    }

    const sItem = await Users.findOne({
        _id: mongoose.Types.ObjectId(req.body.id),
        role: {$elemMatch: {$eq: req.body.role}},
    });

    /**
     * Updating of the client profile
     */
    if (sItem) {
        Users.collection.updateOne({
            _id: mongoose.Types.ObjectId(req.body.id),
            role: {$elemMatch: {$eq: req.body.role}},
        }, [{
            $set: {
                name: req.body.name.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                email: req.body.email,
                phone: req.body.phone,
                gender: req.body.gender,
                age: req.body.age,

                updated_date: new Date().toLocaleDateString([], {
                    year: 'numeric',
                    month: 'long',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                }),
                photo: req.body.photo,
                bgPhoto: req.body.bgPhoto,
            }
        }])
            .then(async () => {
                /**
                 * Updating of the provider profile for repeat reminder option
                 */
                if(req.body.role === "client") {
                    let _temp = {
                        repeat_id: req.body.id,
                        value: req.body.repeat_reminders,
                    };
                    let array_reminder = [];

                    let provider_info = await Users.findOne({
                        _id: mongoose.Types.ObjectId(req.body._provider_id),
                    });

                    if(provider_info.repeat_reminders && provider_info.repeat_reminders.length > 0) {
                        let flag = 0;
                        provider_info.repeat_reminders.map((sIem, key) => {
                            if(sIem.repeat_id === req.body.id) {
                                if(req.body.repeat_reminders !== 0){
                                    array_reminder.push(_temp);
                                    flag = 1;
                                }
                            } else {
                                array_reminder.push(sIem);
                            }
                        });
                        if(flag === 0) {
                            if(req.body.repeat_reminders !== 0){
                                array_reminder.push(_temp);
                            }
                        }
                    } else {
                        if(req.body.repeat_reminders !== 0){
                            array_reminder.push(_temp);
                        }
                    }

                    Users.collection.updateOne({
                        _id: mongoose.Types.ObjectId(req.body._provider_id),
                    }, [{
                        $set: {
                            repeat_reminders: array_reminder,
                            updated_date: new Date().toLocaleDateString([], {
                                year: 'numeric',
                                month: 'long',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                            }),
                        }
                    }]);
                }
                res.status(200).json({msg: 'The profile information has updated successfully.'});
            })
            .catch(err => {
                res.status(400).json({msg: err.toString()});
            })
    } else {
        return res.status(400).json({msg: 'Record not found'});
    }
});

/**
 * User profile address update
 */
router.all("/address-update", async (req, res) => {
    const sItem = await Users.findOne({
        _id: mongoose.Types.ObjectId(req.body.id),
        role: {$elemMatch: {$eq: req.body.role}},
    });

    if (sItem) {
        const address1 = req.body.address1 ? req.body.address1.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()) : '';
        const address2 = req.body.address2 ? req.body.address2.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()) : '';
        const city = req.body.city ? req.body.city.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()) : '';
        const state_province = req.body.state_province ? req.body.state_province.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()) : '';

        // check customer
        let customer = null;
        let account = null;
        let accountLinks = null;
        if (req.body.role === 'provider') {
            if (sItem.stripe_customer_id) {
                customer = await stripe.customers.retrieve(
                    sItem.stripe_customer_id
                );

                customer = await stripe.customers.update(
                    sItem.stripe_customer_id,
                    {
                        address: {
                            line1: address1,
                            line2: address2,
                            city: city,
                            state: state_province,
                            postal_code: req.body.zip_code,
                            country: req.body.country,
                        },
                        name: req.body.cardholder_name,
                        description: 'updated by provider admin',
                        source: req.body.token,
                    },
                );
            } else {
                customer = await stripe.customers.create({
                    address: {
                        line1: address1,
                        line2: address2,
                        city: city,
                        state: state_province,
                        postal_code: req.body.zip_code,
                        country: req.body.country,
                    },
                    email: req.body.email,
                    //email: req.body.email.toLowerCase(),
                    name: req.body.cardholder_name,
                    description: 'created by provider admin',
                    source: req.body.token,
                });
            }

            if (sItem.stripe_account_id) {
                const deleted = await stripe.accounts.del(
                    sItem.stripe_account_id,
                );
            }

            account = await stripe.accounts.create({
                type: 'express',
                // email: req.body.email.toLowerCase(),
                email: req.body.email,
                capabilities: {
                    card_payments: {requested: true},
                    transfers: {requested: true},
                },
            });

            accountLinks = await stripe.accountLinks.create({
                account: account.id,
                refresh_url: Config.FRONT_URL,
                return_url: Config.FRONT_URL,
                type: 'account_onboarding',
            });
        }

        Users.collection.updateOne({
            _id: mongoose.Types.ObjectId(req.body.id),
            role: {$elemMatch: {$eq: req.body.role}},
        }, [{
            $set: {
                address1: address1,
                address2: address2,
                city: city,
                state_province: state_province,
                zip_code: req.body.zip_code,
                country: req.body.country,
                updated_date: new Date().toLocaleDateString([], {
                    year: 'numeric',
                    month: 'long',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                }),
                stripe_customer_id: customer ? customer.id : null,
                stripe_account_id: account ? account.id : null,
            }
        }]).then(() => {
            return res.status(200).json({
                msg: 'Your address has updated successfully.',
                accountLink: accountLinks ? accountLinks.url : null
            });
        }).catch(e => {
            return res.status(400).json({msg: e.toString()});
        });
    } else {
        console.log("Such info does not exist.");
        return res.status(400).json({msg: 'The update has failed.'});
    }
});

/**
 * User profile introduction update
 */
router.all("/about-update", async (req, res) => {
    const sItem = await Users.findOne({
        _id: mongoose.Types.ObjectId(req.body.id),
        role: {$elemMatch: {$eq: req.body.role}},
    });

    if (isNaN(req.body.cost) === true) {
        return res.status(400).json({msg: 'Please input the cost correctly'});
    } else {
        if (sItem) {
            Users.collection.updateOne({
                _id: mongoose.Types.ObjectId(req.body.id),
                role: {$elemMatch: {$eq: req.body.role}},
            }, [{
                $set: {
                    about: req.body.about,
                    license_info: req.body.license_info,
                    cost: Number(req.body.cost),
                    expertise: req.body.expertise,
                    category: req.body.category,
                    updated_date: new Date().toLocaleDateString([], {
                        year: 'numeric',
                        month: 'long',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                    }),
                }
            }]).then(() => {
            }).catch(e => {
                return res.status(400).json({msg: e.toString()});
            });

            return res.status(200).json({msg: 'The profile introduction has updated successfully.'});
        } else {
            return res.status(400).json({msg: 'The update has failed.'});
        }
    }
});

/**
 * Room background Image update
 */
router.all("/room-image", async (req, res) => {
    const sItem = await Users.findOne({
        _id: mongoose.Types.ObjectId(req.body.id),
        role: {$elemMatch: {$eq: req.body.role}},
    });

    if (sItem) {
        Users.collection.updateOne({
            _id: mongoose.Types.ObjectId(req.body.id),
            role: {$elemMatch: {$eq: req.body.role}},
        }, [{
            $set: {
                bgRoom: req.body.bgRoom,
                bgMusic: req.body.bgMusic,
            }
        }]).then(() => {
        }).catch(e => {
            return res.status(400).json({msg: e.toString()});
        });
    } else {
        return res.status(400).json({msg: 'The update has failed.'});
    }
});

/**
 * Id, music, and background image as background image and music info
 */
router.all("/get-background-user", async (req, res) => {
    Users.findOne({
        _id: mongoose.Types.ObjectId(req.body.id),
        role: {$elemMatch: {$eq: req.body.role}},
    }, ["-name", "-email", "-password", "-practice_name", "-loggedIn_state", "-phone", "-updated_date", "-bgPhoto", "-bigPhoto", "-address1", "-address2",
        "-city", "-state_province", "-zip_code", "-country", "-about", "-cost", "-license_info", "-loggedIn_state", "-expertise",])
        .then(userBg => {
            if (userBg) {
                return res.status(200).json({msg: 'The user background info has got successfully.', results: userBg});
            } else {
                return res.status(400).json({msg: 'Such user can not find.'});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Getting ID, name, city, address1, address2, state_province, phone, bgPhoto List of the provider for Front-directory-search UI
 */
router.all("/get-middle-information", async (req, res) => {
    let sArray = [];
    for (let k = 0; k < req.body.special_category.length; k ++) {
        sArray.push(req.body.special_category[k].id);
    }
    let looking_array;
    if (req.body.looking_value !== '') {
        looking_array = req.body.looking_value.split(" ");
    }
    let obj = {role: {$elemMatch: {$eq: 'provider'}},};
    if (req.body.expertise_category.length > 0) {
        obj.expertise = {$elemMatch: {$in: req.body.expertise_category}};
    }
    if(req.body.country !== '') {
        obj.country = req.body.country;
    }
    if(req.body.state_province !== '') {
        obj.state_province = req.body.state_province;
    }

    let filter = [];
    if(!(req.body.price.length === 1 && req.body.price[0] === 0)) {
        //obj.cost = req.body.price;
        //        start_time: {$gte: array[k].start, $lt: array[k].end},
        let priceArray = [];
        let price = req.body.price;
        for (let i = 0; i < price.length; i ++) {
            if (price[i] === 1) {
                priceArray.push({cost: {$gte: 0, $lt: 90}})
            } else if (price[i] === 2) {
                priceArray.push({cost: {$gte: 90, $lt: 130}})
            } else if (price[i] === 3) {
                priceArray.push({cost: {$gte: 130}})
            }
        }
        obj.$and = [{$or: priceArray}];
        filter.push({$or: priceArray});
        obj.$and = filter;
    }
    if(!(req.body.age.length === 1 && req.body.age[0] === 0)) {
        let ageArray = [];
        let age = req.body.age;
        const nYear = new Date().getFullYear();

        for (let i = 0; i < age.length; i ++) {
            if (age[i] === 1) {
                ageArray.push({age: {$gte: nYear - 6, }})
            } else if (age[i] === 2) {
                ageArray.push({age: {$gte: nYear - 10, $lt: nYear - 7}})
            } else if (age[i] === 3) {
                ageArray.push({age: {$gte: nYear - 13, $lt: nYear - 11}})
            } else if (age[i] === 4) {
                ageArray.push({age: {$gte: nYear - 19, $lt: nYear - 14}})
            } else if (age[i] === 5) {
                ageArray.push({age: {$gte: nYear - 64, $lt: nYear - 20}})
            } else if (age[i] === 6) {
                ageArray.push({age: {$lt: nYear - 65, }})
            }
        }
        if(filter.length === 0) {
            obj.$and = [{$or: ageArray}];
        } else {
            filter.push({$or: ageArray});
            obj.$and = filter;
        }
    }

    if(req.body.gender !== 'Gender') {
        obj.gender = req.body.gender;
    }
    if(sArray.length > 0) {
        obj.category = {$elemMatch: {$in: sArray}};
    }
    if(req.body.looking_value !== '') {
        obj.$or = [
            {"city": req.body.looking_value }
        ]
    }

    let sort = '';
    if(req.body.sort === "newest_first") {
        sort = {
            registered_date: 1,
        }
    } else if (req.body.sort === "oldest_first") {
        sort = {
            registered_date: -1,
        }
    } else if (req.body.sort === "random") {
        sort = {
        }
    } else if (req.body.sort === "highest_rating") {
        sort = {
            cost: -1,
        }
    } else if (req.body.sort === "lowest_rating") {
        sort = {
            cost: 1,
        }
    } else if (req.body.sort === "most_views") {
        sort = {
            registered_date: -1,
        }
    } else if(req.body.sort === "") {
        sort = {}
    }
    const pagination = req.body.pagination ? parseInt(req.body.pagination) : 10;
    const page_number = req.body.current_page ? parseInt(req.body.current_page) : 1;
    const page_neighbours = req.body.page_neighbours ? parseInt(req.body.page_neighbours) : 1;
    let total_list_count = await Users.find(obj, ["-email", "-password", "-practice_name", "-loggedIn_state", "-updated_date", "-bigPhoto",
        "-zip_code", "-country", "-about", "-cost", "-license_info", "-loggedIn_state", "-expertise",])
        .collation({locale: 'en', strength: 2})
        .then(items => {
            return items.length;
        }).catch(err => {
            return 0;
    });

    const total_page = Math.ceil(total_list_count / pagination);
    const start_page = Math.max(1, page_number - page_neighbours);
    const end_page = Math.min(total_page, page_number + page_neighbours);
    const page_num = {
        start_page: start_page,
        end_page: end_page,
        total_page: total_page,
    };

    Users.find(obj, ["-email", "-password", "-practice_name", "-loggedIn_state", "-updated_date", "-bigPhoto",
        "-zip_code", "-country", "-about", "-cost", "-license_info", "-loggedIn_state", "-expertise",])
        .collation({locale: 'en', strength: 2})
        .sort(sort)
        .skip((page_number - 1) * pagination)
        .limit(pagination)
        .then(userMiddleInfo => {
            if (userMiddleInfo) {
                const result = {
                    list: userMiddleInfo,
                    page_num: page_num,
                };
                return res.status(200).json({
                    msg: 'The user info has got successfully for directory-search page.',
                    results: result
                });
            } else {
                return res.status(400).json({msg: 'Such user can not find.'});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * ID, Email, and Name List of the provider or client
 */
router.all("/get-users", async (req, res) => {
    let data;
    if (req.body.role === 'provider') {
        data = {
            role: {$elemMatch: {$eq: 'provider'}},
            $and: [{deleted_date: null}],
            $nor: [{_id: mongoose.Types.ObjectId(req.body.id)}],
            client_ids: {$elemMatch: {$eq: req.body.id}},
        };
    } else if (req.body.role === 'client') {
        data = {
            role: {$elemMatch: {$eq: 'client'}},
            $and: [{deleted_date: null}],
            $nor: [{_id: mongoose.Types.ObjectId(req.body.id)}],
            provider_ids: {$elemMatch: {$eq: req.body.id}},
        };
    }

    Users.find(data, ["-password", "-practice_name", "-photo", "-loggedIn_state", "-phone", "-updated_date", "-bgPhoto", "-bigPhoto", "-address1", "-address2",
        "-city", "-state_province", "-zip_code", "-country", "-about", "-cost", "-license_info", "-loggedIn_state", "-bgMusic", "-bgRoom", "-expertise",])
        .sort({name: 1})
        .then(userList => {
            if (userList) {
                return res.status(200).json({
                    results: userList
                });
            } else {
                return res.status(400).json({msg: 'The ' + req.body.role + ' can not find'});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});


/**
 * ID, Email, and Name List of the allowed provider
 */
router.all("/get-allow-providers", async (req, res) => {
    let data;
    data = {
        role: {$elemMatch: {$eq: 'provider'}},
        $and: [{deleted_date: null}],
        $nor: [{_id: mongoose.Types.ObjectId(req.body.id)}],
        client_ids: {$elemMatch: {$eq: req.body.id}},
        allow_requests: true,
    };

    Users.find(data, ["-password", "-practice_name", "-photo", "-loggedIn_state", "-phone", "-updated_date", "-bgPhoto", "-bigPhoto", "-address1", "-address2",
        "-city", "-state_province", "-zip_code", "-country", "-about", "-cost", "-license_info", "-loggedIn_state", "-bgMusic", "-bgRoom", "-expertise",])
        .sort({name: 1})
        .then(userList => {
            if (userList) {
                return res.status(200).json({results: userList});
            } else {
                return res.status(400).json({msg: 'The ' + req.body.role + ' can not find'});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Getting the practice names of the provider
 */
router.all("/get-practice", async (req, res) => {
    let data;
    data = {
        role: {$elemMatch: {$eq: 'provider'}},
        $and: [{deleted_date: null}],
        $nor: [{_id: mongoose.Types.ObjectId(req.body.id)}],
        main_provider_id: req.body.id,
    };

    Users.find(data, ["-password", "-loggedIn_state", "-phone", "-updated_date", "-bgPhoto", "-bigPhoto", "-address1", "-address2",
        "-city", "-state_province", "-zip_code", "-country", "-about", "-cost", "-license_info", "-loggedIn_state", "-bgMusic", "-bgRoom", "-expertise",])
        .sort({name: 1})
        .then(userList => {
            if (userList) {
                return res.status(200).json({
                    results: userList
                });
            } else {
                return res.status(400).json({msg: 'The ' + req.body.role + ' can not find'});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Getting the practice names of the client
 */
router.all("/get-client-practices", async (req, res) => {
    let data;
    data = {
        role: {$elemMatch: {$eq: 'provider'}},
        $and: [{deleted_date: null}],
        $nor: [{_id: mongoose.Types.ObjectId(req.body.id)}],
        client_ids: {$elemMatch: {$eq: req.body.id}},
    };
    Users.find(data, ["-password", "-loggedIn_state", "-phone", "-updated_date", "-bgPhoto", "-bigPhoto", "-address1", "-address2",
        "-city", "-state_province", "-zip_code", "-country", "-about", "-cost", "-license_info", "-loggedIn_state", "-bgMusic", "-bgRoom", "-expertise",
        ])
        .sort({name: 1})
        .then(userList => {
            if (userList) {

                let array = [];
                for (let k = 0; k < userList.length; k ++) {
                    array.push({
                        provider_name: userList[k].name,
                        provider_photo: userList[k].photo,
                        practice_name: userList[k].practice_name,
                    })
                }
                return res.status(200).json({
                    results: array
                });
            } else {
                return res.status(400).json({msg: 'The ' + req.body.role + ' can not find'});
            }
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Deleting the user
 */
router.all("/delete-user", async (req, res) => {
    Users.collection.updateOne({
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
            return res.status(200).json({msg: "Deleted the user successfully"});
        }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Get Drag List
 */
router.all("/get-drag", async (req, res) => {
    let userInfo = await Users.findOne({_id: mongoose.Types.ObjectId(req.body.id)});
    if (req.body.role === "provider") {
        if (userInfo.provider_drags.length === 0) {
            let listArray = [
                {'title': 'Client List', 'color': '#743ba2'},
                {'title': 'Message Center', 'color': '#2f4f81'},
                {'title': 'Appointment List', 'color': '#80b540'},
                {'title': 'Invoice List', 'color': '#5680e9'},
                {'title': 'Payment List', 'color': '#5ab9ea'},
                {'title': 'Client Requested List', 'color': '#84ceeb'},
                {'title': 'Document List', 'color': '#2faf81'},
            ];

            Users.collection.updateOne({_id: mongoose.Types.ObjectId(req.body.id)},
                [{
                    $set: {
                        provider_drags: listArray,
                    }
                }]).then(() => {
                return res.status(200).json({results: listArray});
            }).catch(err => {
                return res.status(400).json({msg: err.toString()});
            });
        } else {
            return res.status(200).json({msg: "Drag List", results: userInfo.provider_drags});
        }
    } else {
        if (userInfo.client_drags.length === 0) {
            let listArray = [
                {'title': 'Provider List', 'color': '#743ba2'},
                {'title': 'Message Center', 'color': '#2f4f81'},
                {'title': 'Appointment List', 'color': '#80b540'},
                {'title': 'Invoice List', 'color': '#5680e9'},
                {'title': 'Payment List', 'color': '#5ab9ea'},
                {'title': 'Document List', 'color': '#2faf81'},
            ];

            Users.collection.updateOne({_id: mongoose.Types.ObjectId(req.body.id)},
                [{
                    $set: {
                        client_drags: listArray,
                    }
                }]).then(() => {
                return res.status(200).json({results: listArray});
            }).catch(err => {
                return res.status(400).json({msg: err.toString()});
            });
        } else {
            return res.status(200).json({msg: "Drag List", results: userInfo.client_drags});
        }
    }
});

/**
 * Drag Update
 */
router.all("/drag-update", async (req, res) => {
    let data;
    if (req.body.role === "provider") {
        data = {
            provider_drags: req.body.list
        };
    } else {
        data = {
            client_drags: req.body.list
        };
    }

    Users.collection.updateOne({_id: mongoose.Types.ObjectId(req.body.id)},
        [{
            $set: data
        }]).then(() => {
        return res.status(200).json({msg: "The customizing list has updated successfully."});
    }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * ID, Email, and Name, phone number List of the provider
 */
router.all("/get-user-list", async (req, res) => {
    const pagination = req.body.client_pagination ? parseInt(req.body.client_pagination) : 10;
    const page_number = req.body.client_current_page ? parseInt(req.body.client_current_page) : 1;
    const page_neighbours = req.body.client_page_neighbours ? parseInt(req.body.client_page_neighbours) : 1;

    // The same group with the current user
    let userInfo = await Users.findOne({_id: mongoose.Types.ObjectId(req.body.id)},
        ["-password", "-practice_name", "-loggedIn_state", "-updated_date", "-photo", "-bgPhoto", "-bigPhoto", "-address1", "-address2",
            "-city", "-state_province", "-zip_code", "-country", "-about", "-cost", "-license_info", "-loggedIn_state", "-bgMusic", "-bgRoom", "-expertise",]);

    let data;
    if (req.body.role === 'provider') {
        if (userInfo.main_provider_id === 'false') { // main provider
            data = {
                role: {$elemMatch: {$eq: req.body.role}},
                $and: [{deleted_date: null}],
                $nor: [{_id: mongoose.Types.ObjectId(req.body.id)}],
                main_provider_id: req.body.id,
            };
        } else if (userInfo.main_provider_id.length > 0) { // added provider
            data = {
                role: {$elemMatch: {$eq: req.body.role}},
                $and: [{deleted_date: null}],
                $nor: [{_id: mongoose.Types.ObjectId(req.body.id)}],
                $or: [{main_provider_id: userInfo.main_provider_id}, {_id: mongoose.Types.ObjectId(userInfo.main_provider_id)},],
            };
        }
    } else if (req.body.role === 'client') {
        // Removing the deleted element
        data = {
            role: {$elemMatch: {$eq: req.body.role}},
            $and: [{deleted_date: null}],
            $nor: [{_id: mongoose.Types.ObjectId(req.body.id)}]
        };
    } else if (req.body.role === 'patient') {
        data = {
            role: {$elemMatch: {$eq: 'provider'}},
            $and: [{deleted_date: null}],
            $nor: [{_id: mongoose.Types.ObjectId(req.body.id)}],
            client_ids: {$elemMatch: {$eq: req.body.id}},
        };
    }

    let temp = await Users.aggregate([
        {$match: data},
    ]);

    const total_list_count = temp.length;
    const total_page = Math.ceil(total_list_count / pagination);
    const start_page = Math.max(1, page_number - page_neighbours);
    const end_page = Math.min(total_page, page_number + page_neighbours);
    const page_num = {
        start_page: start_page,
        end_page: end_page,
        total_page: total_page,
    };

    Users.find(data, ["-password", "-practice_name", "-loggedIn_state", "-updated_date", "-bgPhoto", "-bigPhoto", "-address1", "-address2",
        "-city", "-state_province", "-zip_code", "-country", "-about", "-cost", "-license_info", "-loggedIn_state", "-bgMusic", "-bgRoom", "-expertise",])
        .collation({locale: 'en', strength: 2})
        .sort({name: 1})
        .skip((page_number - 1) * pagination)
        .limit(pagination)
        .then(userList => {
            if (userList) {
                const result = {
                    list: userList,
                    page_num: page_num,
                };
                return res.status(200).json({
                    msg: 'ID, Email, name, phone number of the whole users' + req.body.role + ' list got successfully.',
                    results: result
                });
            } else {
                return res.status(400).json({msg: 'The ' + req.body.role + ' can not find'});
            }
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        });
});

/**
 *
 * Contact US
 *
 */
router.all("/send-contact", async (req, res) => {
    if (req.body.role === 'booking') {
        if (req.body.first_name === '' || req.body.last_name === '' || req.body.email === '' || req.body.phone_number === '') {
            return res.status(400).json({msg: 'Please fill the whole input fields.'});
        }
    } else if ((req.body.first_name === '' || req.body.last_name === '' || req.body.email === '' || req.body.job_title === '' || req.body.company_name === '')) {
        console.log('Please fill the whole input fields.');
        return res.status(400).json({msg: 'Please fill the whole input fields.'});
    }

    if(req.body.phone_number) {
        let isnum = /^\d+$/.test(req.body.phone_number);
        if(req.body.phone_number.length <= 8 || isnum === false) {
            console.log('Please input the phone number correctly.');
            return res.status(400).json({msg: 'Please input the phone number correctly.'});
        }
    }

    if (req.body.email.includes("@") === false || req.body.email.includes(".") === false) {
        console.log('Please input the valid email.');
        return res.status(400).json({msg: 'Please input the valid email.'});
    } else {
        let mailOptions;
        let path = req.body.email;
        if (req.body.role === 'booking') {
            mailOptions = {
                from: Config.MAIL_DURATION,
                to: `${req.body.first_name} <${Config.MAIL_DURATION}>`,

                subject: 'TeleTherapist: Contact Us',
                //html: '<p>${req.body.email}</p>'
                html: `<p>${req.body.first_name} had contacted you having the following information.<br />
                            Field: ${req.body.select_item}<br />
                            First Name: ${req.body.first_name}<br />
                            Last Name: ${req.body.last_name}<br />
                            Email Address: ${req.body.email}<br />
                            Meeting Duration: 20 mins<br />
                            Phone Number: ${req.body.phone_number}<br />
                            Booking Date: ${new Date(req.body.booking_date)}<br />
                            Please click <a href='mailto: ${path}'> here</a></p>`,
            };
        } else {
            mailOptions = {
                from: Config.MAIL_SUPPORT,
                to: `${req.body.first_name} <${Config.MAIL_SUPPORT}>`,

                subject: 'TeleTherapist: Contact Us',
                //html: '<p>${req.body.email}</p>'
                html: `<p>${req.body.first_name} had contacted you having the following information.<br />
                            Field: ${req.body.select_item}<br />
                            First Name: ${req.body.first_name}<br />
                            Last Name: ${req.body.last_name}<br />
                            Email Address: ${req.body.email}<br />
                            Job Title: ${req.body.job_title}<br />
                            Company Name: email: ${req.body.company_name}<br />
                            Message: ${req.body.msg}<br />
                            Please click <a href='mailto: ${path}'> here</a></p>`,
            };
        }

        let transporter = await nodemailerCreate();
        await transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
                return res.status(400).json({msg: error.toString()});
            } else {
                return res.status(200).json({msg: "You have sent the contact information to Teletherapist Support Team"});
            }
        });
    }
});
module.exports = router;