const express = require("express");
const router = express.Router();
const mongoose = require('mongoose');
const Appointments = require("../models/appointment");
const Users = require("../models/user");
const config = require("../config");
const stripe = require('stripe')(config.STRIPE_SK);
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');

const cron = require('node-cron'); // Scheduling notification node module

const client = require('twilio')(config.SMS_CONFIG.accountSid, config.SMS_CONFIG.authToken);
const global = require('../global');
/**
 *
 */
cron.schedule('*/5 * * * *', async () => {
    console.log('running a task every 5 minutes');
    await onReminders();
});

async function onReminders() {
    let data;
    data = {
        role: {$elemMatch: {$eq: 'provider'}},
        $and: [{deleted_date: null}],
        reminders: true,
    };

    let userList = await Users.find(data, ["-password", "-practice_name", "-photo", "-loggedIn_state", "-phone", "-updated_date", "-bgPhoto", "-bigPhoto", "-address1", "-address2",
        "-city", "-state_province", "-zip_code", "-country", "-about", "-cost", "-license_info", "-loggedIn_state", "-bgMusic", "-bgRoom", "-expertise",
        "-provider_drags", "-client_drags", "-category", "-stripe_customer_id", "-stripe_account_id", "-stripe_subscription_id", "-provider_ids", "-client_ids", "-plan_string"]);

    userList && userList.map(async (user, key) => {
        let temp = {
            provider_id: user._id,
            $and: [{deleted_date: null}, {$nor: [{reminder_check: true},]}],
            $nor: [{state: 0}, ], // not the invited appointment
        };
        let provider_email = user.email;
        let provider_name = user.name;
        const microMinutes = 24 * 60 * (1000 * 60); // 24 hours
        let reminder_value = Number(user.reminders_value) * microMinutes; // keeping the notification for reminders_value days

        await Appointments.find(temp).then(async item => {
            if(item && item.length > 0) {
                for (let i = 0; i < item.length; i ++) {
                    let current_time = new Date();
                    let start_time = item[i].start_time;
                    let startDate = new Date(start_time).getTime();
                    let currentDate = current_time.getTime();
                    let flag =(startDate - currentDate)/reminder_value;

                    if(flag >= 0 && flag <= 1) { // Start the notification for reminders_value days
                        let client_emails = [];
                        let client_names = [];

                        for (let k = 0; k < item[i].invitees_id.length; k ++) {
                            temp = {
                                _id: mongoose.Types.ObjectId(item[i].invitees_id[k]),
                                role: {$elemMatch: {$eq: 'client'}},
                                $and: [{deleted_date: null},],
                            };
                            let _client = await Users.aggregate([
                                {$match: temp}
                            ]);

                            if(_client) {
                                /**
                                 * Sending the email message to the clients
                                 */
                                let _temp = `<p>You should have the session with ${provider_name}, on ${new Date(start_time).toUTCString()}.</p>`;
                                await send_email(_client[0].email, _temp);

                                client_emails.push(_client[0].email);
                                client_names.push(_client[0].name);
                            }
                        }

                        if(client_emails.length > 0) {
                            /**
                             * Sending the email message to the provider
                             */
                            let _temp = `<p>You should have the session with ${client_names}, on ${new Date(start_time).toUTCString()}.</p>`;
                            await send_email(provider_email, _temp);

                            console.log("client IDs   = ", item[i].invitees_id, " -> ", client_emails);
                            console.log("provider IDs = ", user._id, provider_email);
                        }
                    }

                    /**
                     * Even if the reminder notification time has passed, reminder_check = true
                     */
                    if(flag <= 1) {
                        Appointments.collection.updateOne({
                                _id: mongoose.Types.ObjectId(item[i]._id),
                            },
                            [{
                                $set:
                                    {
                                        reminder_check: true,
                                        last_reminder_date: new Date().toUTCString([], {
                                            year: 'numeric',
                                            month: 'long',
                                            day: '2-digit',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        }),
                                    }
                            }]
                        ).then(() => {
                            console.log("The reminder_check has updated.")
                        }).catch(err => {
                            console.log(err.toString());
                        });
                    }
                }
            }
        }).catch(err => {
            console.log(err.toString());
        });

        /**
         *
         * Repeat Reminders
         *
         */
        if(user.repeat_reminders.length > 0) {
            let provider_id = user._id;
            for (let k = 0; k < user.repeat_reminders.length; k ++) {
                let client_id = user.repeat_reminders[k].repeat_id;
                let oneHour = 60 * (1000 * 60); // 1 hour
                let repeat_value = Number(user.repeat_reminders[k].value) * oneHour;

                let current_time = new Date();
                let currentDate = current_time.getTime();

                let temp = {
                    provider_id: provider_id,
                    invitees_id: {$elemMatch: {$eq: client_id}},
                    reminder_check: true,
                    $and: [{deleted_date: null},],
                    $nor: [{state: 0}, ], // not the invited appointment
                };

                await Appointments.find(temp)
                    .then(async item => {
                        if(item) {
                            for (let i = 0; i < item.length; i ++) {
                                let last_time = item[i].last_reminder_date;
                                let lastDate = new Date(last_time).getTime();
                                let flag =(currentDate - lastDate)/repeat_value;

                                let start_time = item[i].start_time;
                                let startDate = new Date(start_time).getTime();

                                if(flag >= 1 && startDate > currentDate) {
                                    let client_emails = [];
                                    let client_names = [];

                                    for (let k = 0; k < item[i].invitees_id.length; k ++) {
                                        temp = {
                                            _id: mongoose.Types.ObjectId(item[i].invitees_id[k]),
                                            role: {$elemMatch: {$eq: 'client'}},
                                            $and: [{deleted_date: null},],
                                        };
                                        let _client = await Users.aggregate([
                                            {$match: temp}
                                        ]);

                                        if(_client) {
                                            /**
                                             * Sending the email message to the clients
                                             */
                                            let _temp = `<p>You should have the session with ${provider_name}, on ${new Date(start_time).toUTCString()}.</p>`;
                                            await send_email(_client[0].email, _temp);

                                            client_emails.push(_client[0].email);
                                            client_names.push(_client[0].name);
                                        }
                                    }

                                    if(client_emails.length > 0) {
                                        /**
                                         * Sending the email message to the provider
                                         */
                                        let _temp = `<p>You should have the session with ${client_names}, on ${new Date(start_time).toUTCString()}.</p>`;
                                        await send_email(provider_email, _temp);

                                        console.log("client: ", item[i].invitees_id, " -> ", client_emails);
                                        console.log("\n provider: ", user._id, provider_email);
                                    }

                                    Appointments.collection.updateOne({
                                            _id: mongoose.Types.ObjectId(item[i]._id),
                                        },
                                        [{
                                            $set:
                                                {
                                                    last_reminder_date: new Date().toUTCString([], {
                                                        year: 'numeric',
                                                        month: 'long',
                                                        day: '2-digit',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    }),
                                                }
                                        }]
                                    ).then(() => {
                                        console.log("The last reminder time has updated.")
                                    }).catch(err => {
                                        console.log(err.toString());
                                    });
                                }
                            }
                        }
                    }).catch(err => {
                        console.log(err.toString());
                    })
            }
        }
    });

    async function send_email(email, txt) {
        let mailOptions, transporter;
        mailOptions = {
            from: config.MAIL_SENDER,
            to: email,
            subject: 'TeleTherapist: The Appointment Notification',
            html: txt,
        };
        transporter = await nodemailerCreate();
        transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
                console.log(error.toString());
            } else {
                console.log("The appointment notification sent successfully.");
            }
        });
    }
}

async function nodemailerCreate() {
    return nodemailer.createTransport(config.MAIL_CONFIG);

    // return nodemailer.createTransport(sgTransport({
    //     auth: {
    //         api_key: config.MAIL_SG_API,
    //     }
    // }));
}

router.all("/create-appointment", async (req, res) => {
    if(req.body.update_flag !== true) {
        const discrimination = await Users.findOne({_id:mongoose.Types.ObjectId(req.body.provider_id)});
        console.log(discrimination.plan_string, "This is our plan");

        if(discrimination.plan_string === undefined) {
            let str;
            str = "Firstly, please upgrade your account to create the appointment.";
            return res.status(400).json({msg: str});
        } else {
            if(discrimination.plan_string === "month_individual_basic" || discrimination.plan_string === "year_individual_basic") {
                const limit = 5;
                let nCount = await Appointments.collection.countDocuments({provider_id: req.body.provider_id});
                if(nCount >= limit) {
                    let str;
                    str = "You already had 5 online sessions this month. Please upgrade your account to create more appointments.";
                    return res.status(400).json({msg: str})
                }
            }
        }
    } else {
        let sTemp = await Appointments.findOne({_id: mongoose.Types.ObjectId(req.body._id)});
        let startTime = Math.floor((new Date(sTemp.start_time)).getTime() / (1000 * 60));
        let currentTime = Math.floor((new Date()).getTime() / (1000 * 60));
        /**
         * editable_state decision
         */
        let editable_state;
        if(startTime > currentTime) {
            if((sTemp.state === 1 || sTemp.state === 2 || sTemp.state === 3 || sTemp.state === 31) && (sTemp.actual_start === undefined) && (sTemp.paid_date === null || sTemp.paid_date === undefined || sTemp.payment === 0)) {
                editable_state = 1;
            } else {
                editable_state = 0;
            }
        } else {
            editable_state = 0;
        }

        if(editable_state === 0) {
            await Appointments.collection.updateOne(
                {_id: mongoose.Types.ObjectId(req.body._id)},
                [{
                    $set: {
                        editable_state: 0,
                    }
                }]);
            return res.status(400).json({msg: "You can not edit this appointment now. The client may have already paid or the session start time may have passed."});
        }
    }

    let sWeekNumber = getWeekNumber(new Date(req.body.start_time));
    let LIMIT_TIME = 60;
    let decision = req.body.time_distance/LIMIT_TIME;
    if(decision > 2) {
        return res.status(400).json({msg: "Please choose the end date and time. The meeting time cannot exceed 2 hours."})
    }

    let appointmentStartTime = Math.floor((new Date(req.body.start_time)).getTime() / (1000 * 60));
    let current = Math.floor((new Date()).getTime() / (1000 * 60));

    if(current > appointmentStartTime) {
        return res.status(400).json({msg: "Please choose the start time correctly."})
    }

    if(req.body.invitees_id === '') {
        return res.status(400).json({msg: "Please choose the invitees."})
    }

    if(req.body.update_flag === true) {
        let start = new Date(req.body.start_time);
        let end = req.body.end_time !==''? new Date(req.body.end_time): null;
        let until = req.body.repeat_until !== ""? new Date(req.body.repeat_until): null;

        Appointments.collection.updateOne(
            {_id: mongoose.Types.ObjectId(req.body._id)},
            [{
                $set: {
                    all_day: req.body.all_day,
                    recurring: req.body.recurring,
                    online: req.body.online,
                    title: req.body.title.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                    notes: req.body.notes,
                    time_distance: req.body.time_distance,
                    start_time: start,
                    end_time: end,
                    provider_id: req.body.provider_id,
                    repeat_until: until,
                    invitees_id: req.body.invitees_id,
                    recurrence_frequency: req.body.recurrence_frequency,
                    payment: req.body.payment,
                    appointment_type: req.body.type,
                    updated_date: new Date().toUTCString([], {
                        year: 'numeric',
                        month: 'long',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                    }),
                    role_updated: 'provider',
                    state: 1,
                    week_number: sWeekNumber,
                    editable_state: 1,
                }
            }])
            .then(() => {
                console.log("The appointment has updated successfully.");
            })
            .catch(err => {
                console.log("The appointment updating has failed.", err.toString());
                return res.status(400).json({msg: err.toString()});
            });
    } else {
        const newAppointments = new Appointments({
            all_day: req.body.all_day,
            recurring: req.body.recurring,
            online: req.body.online,
            title: req.body.title.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
            notes: req.body.notes,
            time_distance: req.body.time_distance,
            start_time: req.body.start_time,
            end_time: req.body.end_time,
            provider_id: req.body.provider_id,
            repeat_until: req.body.repeat_until && req.body.repeat_until,
            invitees_id: req.body.invitees_id,
            recurrence_frequency: req.body.recurrence_frequency,
            payment: req.body.payment,
            appointment_type: req.body.type,

            requested_date: new Date().toUTCString([], {
                year: 'numeric',
                month: 'long',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            }),
            state: 1,
            week_number: sWeekNumber,
            editable_state: 1,
        });
        await newAppointments.save();
    }

    let client;
    let array_email = [];

    for (let k = 0; k < req.body.invitees_id.length; k ++) {
        client = await Users.findOne({_id: mongoose.Types.ObjectId(req.body.invitees_id[k])});
        array_email.push(client.email);
    }
    let path = config.CLIENT_URL + '/dashboard';
    let send_proposal;

    if(req.body.update_flag === true) {
        send_proposal = `<p>Hello</p><p>${req.body.provider_name} has updated the ${req.body.online? "online ": ''} appointment request with you!</p>
                        <p style="font-size: 16px; font-weight: bold">Start</p>
                        <p>${new Date(req.body.start_time).toUTCString()}</p>
                        <p style="font-size: 16px; font-weight: bold">Length</p>
                        <p>${req.body.time_distance} minutes</p>
                        </p>${req.body.notes !== ''? "<p style=\"font-size: 16px; font-weight: bold\">Note:</p><p>" + req.body.notes + "</p>": ''}
                        <div style="display: flex; align-items: center; justify-content: center; background-color: #0CABC7; width: 250px; height: 40px">
                             <a href='${path}' style="text-align: center; align-items: center; justify-content: center; color: #fff; font-size: 16px; text-decoration: none;">
                                Log in when it's time to join
                             </a>
                        </div>
                        <div style="background-color: lavenderblush">
                            <p style="padding: 15px">Declining this invitation will not inform your provider or update your appointment with teletherapist. If you need to modify or cancel, please contact your provider.</p>
                        </div>
                        
                        <p>Take care!</p><p>Teletherapist</p>`;
    } else {
        send_proposal = `<p>Hello</p><p>${req.body.provider_name} has scheduled an ${req.body.online? "online ": ''} appointment with you!</p>
                        <p style="font-size: 16px; font-weight: bold">Start</p>
                        <p>${new Date(req.body.start_time).toUTCString()}</p>
                        <p style="font-size: 16px; font-weight: bold">Length</p>
                        <p>${req.body.time_distance} minutes</p>
                        </p>${req.body.notes !== ''? "<p style=\"font-size: 16px; font-weight: bold\">Note:</p><p>" + req.body.notes + "</p>": ''}
                        <div style="display: flex; align-items: center; justify-content: center; background-color: #0CABC7; width: 250px; height: 40px">
                             <a href='${path}' style="text-align: center; align-items: center; justify-content: center; color: #fff; font-size: 16px; text-decoration: none;">
                                Log in when it's time to join
                             </a>
                        </div>
                        <div style="background-color: lavenderblush">
                            <p style="padding: 15px">Declining this invitation will not inform your provider or update your appointment with teletherapist. If you need to modify or cancel, please contact your provider.</p>
                        </div>
                        
                        <p>Take care!</p><p>Teletherapist</p>`;
    }
    let mailOptions = {
        from: config.MAIL_SENDER,
        to: array_email,

        subject: 'TeleTherapist: Appointment Request',
        html: send_proposal,
    };

    let transporter = await nodemailerCreate();
    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
            return res.status(400).json({msg: error.toString()});
        } else {
            console.log('Email sent: ' + info.response);
            let sTag;
            if(req.body.update_flag === true) {
                sTag = "An appointment has updated successfully";
            } else {
                sTag = "An appointment registration succeeded.";
            }

            return res.status(200).json({
                msg: sTag,
            });
        }
    });

    function getWeekNumber(d) {
        // Copy date so don't modify original
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        // Set to nearest Thursday: current date + 4 - current day number
        // Make Sunday's day number 7
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        // Get first day of year
        let yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        // Calculate full weeks to nearest Thursday
        let weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        // Return array of year and week number
        return weekNo;
    }
});

/**
 * Appointment type creating
 */
router.all("/create-appointment-type", async (req, res) => {
    if(req.body.name === '' && req.body.length === '') {
        console.log("Please fill the name field and the default length field");
        return res.status(400).json({msg: "Please fill the name field and the default length field"})
    } else if(req.body.name === "") {
        console.log("Please fill the name field.");
        return res.status(400).json({msg: "Please fill the name field"})
    } else if(req.body.length === '') {
        console.log("Please fill the default length field.");
        return res.status(400).json({msg: "Please fill the default length field"})
    } else {
        let type_array = [];
        let type_name = req.body.name.toLowerCase();
        let name = type_name.split(" ");
        type_name = '';
        for (let i = 0; i < name.length; i ++) {
            if (name[i] !== '') {
                type_name += name[i] + " ";
            }
        }
        type_name = type_name.trim();

        if(req.body.role === "create") {
            const temp = await Users.findOne({_id:mongoose.Types.ObjectId(req.body.id)});

            if(temp.appointment_type === null || temp.appointment_type === undefined || temp.appointment_type.length === 0) {
                type_array = [{
                    name: type_name.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                    length: Number(req.body.length),
                    description: req.body.description.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                }];
            } else {
                type_array = temp.appointment_type;
                for (let k = 0; k < type_array.length; k ++) {
                    if (type_array[k].name.toUpperCase() === type_name.toUpperCase()) {
                        return res.status(400).json({msg: "The same appointment type already exist."})
                    }
                }
                let array = {
                    name: type_name.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                    length: Number(req.body.length),
                    description: req.body.description.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                };
                type_array.push(array);
            }

            Users.collection.updateOne(
                {_id: mongoose.Types.ObjectId(req.body.id)},
                [{
                    $set: {
                        appointment_type: type_array,
                    }
                }])
                .then(() => {
                    console.log("The appointment type has created successfully.");
                    return res.status(200).json({msg: "The appointment type has created successfully."})
                })
                .catch(err => {
                    console.log("The appointment type creating failed.", err.toString());
                    return res.status(400).json({msg: err.toString()});
                });
        } else if(req.body.role === "update") {
            const temp = await Users.findOne({_id:mongoose.Types.ObjectId(req.body.id)});
            if(!temp.appointment_type) {
                return res.status(400).json({msg: "Such appointment type don't exist."})
            } else {
                let str = temp.appointment_type;
                let origin_type = str[req.body.order];
                let new_type = type_name.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase());
                str[req.body.order] = {
                    name: new_type,
                    length: Number(req.body.length),
                    description: req.body.description.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                };

                Users.collection.updateOne(
                    {_id: mongoose.Types.ObjectId(req.body.id)},
                    [{
                        $set: {
                            appointment_type: str,
                        }
                    }])
                    .then(async () => {
                        await Appointments.find({provider_id: req.body.id})
                            .then(async temp => {
                                if(temp) {
                                    for (let j = 0; j < temp.length; j ++) {
                                        if(temp[j].appointment_type === origin_type.name) {
                                            await Appointments.collection.updateOne(
                                                {_id: mongoose.Types.ObjectId(temp[j]._id)},
                                                [{
                                                    $set: {
                                                        appointment_type: new_type,
                                                    }
                                                }])
                                                .then()
                                                .catch(err => {
                                                    return err.status(400).json({msg: err.toString()});
                                                })
                                        }
                                    }
                                }

                            }).catch(err => {
                                return err.status(400).json({msg: err.toString()});
                            });

                        console.log("The appointment type has updated successfully.");
                        return res.status(200).json({msg: "The appointment type has updated successfully."})
                    })
                    .catch(err => {
                        console.log("The appointment type updating failed.", err.toString());
                        return res.status(400).json({msg: err.toString()});
                    });
            }
        }
    }
});

/**
 * Get Appointment Type list
 */
router.all("/get-appointment-type", async (req, res) => {
    await Users.findOne({_id:mongoose.Types.ObjectId(req.body.id)})
        .then(temp => {
            return res.status(200).json({results: temp.appointment_type});
        }).catch(err => {
            return err.status(400).json({msg: err.toString()});
        });
});

/**
 * Delete Appointment Type
 */
router.all("/delete-appointment-type", async (req, res) => {
    const temp = await Users.findOne({_id:mongoose.Types.ObjectId(req.body.id)});
    if(!temp.appointment_type) {
        return res.status(400).json({msg: "Such appointment type don't exist."})
    } else {
        let str = temp.appointment_type;
        let delete_type = str[req.body.order].name;
        str.splice(req.body.order, 1);
        Users.collection.updateOne(
            {_id: mongoose.Types.ObjectId(req.body.id)},
            [{
                $set: {
                    appointment_type: str,
                }
            }])
            .then(async () => {
                await Appointments.find({provider_id: req.body.id})
                    .then(async item => {
                        if(item) {
                            for (let j = 0; j < item.length; j ++) {
                                if(item[j].appointment_type === delete_type) {
                                    await Appointments.collection.updateOne(
                                        {_id: mongoose.Types.ObjectId(item[j]._id)},
                                        [{
                                            $set: {
                                                appointment_type: null,
                                            }
                                        }])
                                        .then()
                                        .catch(err => {
                                            return err.status(400).json({msg: err.toString()});
                                        })
                                }
                            }
                        }

                    }).catch(err => {
                        return err.status(400).json({msg: err.toString()});
                    });

                console.log("The appointment type has deleted successfully.");
                return res.status(200).json({msg: "The appointment type has deleted successfully."})
            })
            .catch(err => {
                console.log("The appointment type deleting failed.", err.toString());
                return res.status(400).json({msg: err.toString()});
            });
    }
});
/**
 * Requested appointment about the allowed provider
 */
router.all("/create-request-appointment", async (req, res) => {
    let str;
    if(req.body.provider_id === '') {
        str = "Please choose the provider you want.";
        return res.status(400).json({msg: str})
    }
    if(req.body.update_flag !== true) {
        const discrimination = await Users.findOne({_id:mongoose.Types.ObjectId(req.body.provider_id)});
        if(discrimination.plan_string === undefined) {
            str = "You can send your request after the provider upgrade the account.";
            return res.status(400).json({msg: str})
        } else {
            if(discrimination.plan_string === "month_individual_basic" || discrimination.plan_string === "year_individual_basic") {
                const limit = 5;
                let nCount = await Appointments.collection.countDocuments({provider_id: req.body.provider_id});
                if(nCount >= limit) {
                    str = "This provider already has 5 online sessions. You can send your request after the provider upgrade the account."
                    return res.status(400).json({msg: str})
                }
            }
        }
    } else {
        let sTemp = await Appointments.findOne({_id: mongoose.Types.ObjectId(req.body._id)});
        let startTime = Math.floor((new Date(sTemp.start_time)).getTime() / (1000 * 60));
        let currentTime = Math.floor((new Date()).getTime() / (1000 * 60));
        /**
         * editable_state decision
         */
        let editable_state;
        if(startTime > currentTime) {
            if((sTemp.state === 1 || sTemp.state === 2 || sTemp.state === 3 || sTemp.state === 31) && (sTemp.actual_start === undefined) && (sTemp.paid_date === null || sTemp.paid_date === undefined || sTemp.payment === 0)) {
                editable_state = 1;
            } else {
                editable_state = 0;
            }
        } else {
            editable_state = 0;
        }
        if(editable_state === 0) {
            await Appointments.collection.updateOne(
                {_id: mongoose.Types.ObjectId(req.body._id)},
                [{
                    $set: {
                        editable_state: 0,
                    }
                }]);
            return res.status(400).json({msg: "You can not edit this appointment now. The client may have already paid or the session start time may have passed."});
        }
    }

    let sWeekNumber = getWeekNumber(new Date(req.body.start_time));
    let LIMIT_TIME = 60;
    let decision = req.body.time_distance/LIMIT_TIME;
    if(decision > 2) {
        return res.status(400).json({msg: "Please choose the end date and time. The meeting time cannot exceed 2 hours."})
    }

    let appointmentStartTime = Math.floor((new Date(req.body.start_time)).getTime() / (1000 * 60));
    let current = Math.floor((new Date()).getTime() / (1000 * 60));

    if(current > appointmentStartTime) {
        return res.status(400).json({msg: "Please choose the start time correctly."})
    }

    if(req.body.invitees_id === '') {
        return res.status(400).json({msg: "Please choose the invitees."})
    }

    let state = 1;
    if(req.body.update_flag === true) {
        let start = new Date(req.body.start_time);
        let end = req.body.end_time !==''? new Date(req.body.end_time): null;
        let until = req.body.repeat_until !== ""? new Date(req.body.repeat_until): null;
        Appointments.collection.updateOne(
            {_id: mongoose.Types.ObjectId(req.body._id)},
            [{
                $set: {
                    all_day: req.body.all_day,
                    recurring: req.body.recurring,
                    online: req.body.online,
                    title: req.body.title.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
                    notes: req.body.notes,
                    time_distance: req.body.time_distance,
                    start_time: start,
                    end_time: end,
                    provider_id: req.body.provider_id,
                    repeat_until: until,
                    invitees_id: req.body.invitees_id,
                    recurrence_frequency: req.body.recurrence_frequency,
                    payment: req.body.payment,
                    updated_date: new Date().toUTCString([], {
                        year: 'numeric',
                        month: 'long',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                    }),
                    role_updated: 'client',
                    state: state,
                    invite_client: true,
                    week_number: sWeekNumber,

                }
            }])
            .then(() => {
                console.log("The appointment has updated successfully.");
            })
            .catch(err => {
                console.log("The appointment updating failed.", err.toString());
                return res.status(400).json({msg: err.toString()});
            });
    } else {
        const newAppointments = new Appointments({
            all_day: req.body.all_day,
            recurring: req.body.recurring,
            online: req.body.online,
            title: req.body.title.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
            notes: req.body.notes,
            time_distance: req.body.time_distance,
            start_time: req.body.start_time,
            end_time: req.body.end_time,
            provider_id: req.body.provider_id,
            repeat_until: req.body.repeat_until && req.body.repeat_until,
            invitees_id: req.body.invitees_id,
            recurrence_frequency: req.body.recurrence_frequency,
            payment: req.body.payment,
            requested_date: new Date().toUTCString([], {
                year: 'numeric',
                month: 'long',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            }),
            state: state,
            invite_client: true,
            week_number: sWeekNumber,
        });
        await newAppointments.save();
    }

    let provider;
    let provider_email;

    provider = await Users.findOne({_id: mongoose.Types.ObjectId(req.body.provider_id)});
    provider_email = provider.email;

    let path = config.PROVIDER_URL + '/dashboard';
    let send_proposal;

    if(req.body.update_flag === true) {
        send_proposal = `<p>Hello</p><p>${req.body.invitees_name[0]} has updated this ${req.body.online? "online ": ''} appointment request!</p>
                        <p style="font-size: 16px; font-weight: bold">Start</p>
                        <p>${new Date(req.body.start_time).toUTCString()}</p>
                        <p style="font-size: 16px; font-weight: bold">Length</p>
                        <p>${req.body.time_distance} minutes</p>
                        </p>${req.body.notes !== ''? "<p style=\"font-size: 16px; font-weight: bold\">Note:</p><p>" + req.body.notes + "</p>": ''}
                        <div style="display: flex; align-items: center; justify-content: center; background-color: #0CABC7; width: 250px; height: 40px">
                             <a href='${path}' style="text-align: center; align-items: center; justify-content: center; color: #fff; font-size: 16px; text-decoration: none;">
                                Log in when it's time to join
                             </a>
                        </div>
                        <div style="background-color: lavenderblush">
                            <p style="padding: 15px">Declining this invitation will not inform your client or update your appointment with teletherapist. If you need to modify or cancel, please contact your client.</p>
                        </div>                        
                        <p>Take care!</p><p>Teletherapist</p>`;
    } else {
        send_proposal = `<p>Hello</p><p>${req.body.invitees_name[0]} has requested an ${req.body.online? "online ": ''} appointment with you!</p>
                        <p style="font-size: 16px; font-weight: bold">Start</p>
                        <p>${new Date(req.body.start_time).toUTCString()}</p>
                        <p style="font-size: 16px; font-weight: bold">Length</p>
                        <p>${req.body.time_distance} minutes</p>
                        </p>${req.body.notes !== ''? "<p style=\"font-size: 16px; font-weight: bold\">Note:</p><p>" + req.body.notes + "</p>": ''}
                        <div style="display: flex; align-items: center; justify-content: center; background-color: #0CABC7; width: 250px; height: 40px">
                             <a href='${path}' style="text-align: center; align-items: center; justify-content: center; color: #fff; font-size: 16px; text-decoration: none;">
                                Log in when it's time to join
                             </a>
                        </div>
                        <div style="background-color: lavenderblush">
                            <p style="padding: 15px">Declining this invitation will not inform your client or update your appointment with teletherapist. If you need to modify or cancel, please contact your client.</p>
                        </div>                        
                        <p>Take care!</p><p>Teletherapist</p>`;
    }
    let mailOptions = {
        from: config.MAIL_SENDER,
        to: provider_email,

        subject: 'TeleTherapist: Appointment Request',
        html: send_proposal,
    };

    let transporter = await nodemailerCreate();

    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
            return res.status(400).json({msg: error.toString()});
        } else {
            console.log('Email sent: ' + info.response);
            let sTag;
            if(req.body.update_flag === true) {
                sTag = "An appointment has updated successfully";
            } else {
                sTag = "An appointment registration succeeded.";
            }

            return res.status(200).json({
                msg: sTag,
            });
        }
    });

    function getWeekNumber(d) {
        // Copy date so don't modify original
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        // Set to nearest Thursday: current date + 4 - current day number
        // Make Sunday's day number 7
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        // Get first day of year
        let yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        // Calculate full weeks to nearest Thursday
        let weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        // Return array of year and week number
        return weekNo;
    }
});

/**
 * creating empty appointment
 */
router.all("/appointment-empty", async (req, res) => {
    /**
     * Leaving one only
     */
    let itemArray = await Appointments.find(
        {
            provider_id: req.body.id,
            state: 0,
            $and: [{$or: [{invite_email: null}, {invite_email: undefined}]}, {$or: [{invite_phone: null}, {invite_phone: undefined}, ]}],
        }
    );
    if(itemArray.length > 1) {
        for (let i = 1; i < itemArray.length; i ++) {
            await Appointments.collection.deleteOne({
                _id: mongoose.Types.ObjectId(itemArray[i]._id),
            });
        }
    }

    const item = await Appointments.findOne(
        {
            provider_id: req.body.id,
            state: 0,
            $and: [{$or: [{invite_email: null}, {invite_email: undefined}]}, {$or: [{invite_phone: null}, {invite_phone: undefined}, ]}],
        }
    );
    if(item){
        return res.status(200).json({results: item._id});
    } else {
        const newAppointments = await new Appointments({
            title: 'Share Link',
            start_time: new Date(),
            provider_id: req.body.id,
            invitees_id: 'Share Link',
            payment: 0,
            requested_date: new Date().toUTCString([], {
                year: 'numeric',
                month: 'long',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            }),
            state: 0,
            week_number: 0,
        });
        await newAppointments.save();
        return res.status(200).json({results: newAppointments._id});
    }
});

router.all("/accept-appointment", async (req, res) => {
    let data;
    let _state = await Appointments.findOne({_id: mongoose.Types.ObjectId(req.body.id)});
    if(_state.payment === 0 || _state.payment === '0') {
        _state = 3;
        data = {
            state: _state, // The accepted state value by client
            accept_state: true,
            paid_date: new Date().toLocaleDateString([], {
                year: 'numeric',
                month: 'long',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            }),
        };
    } else {
        _state = 2;
        data = {
            state: _state, // The accepted state value by client
            accept_state: true,
        };
    }

    Appointments.collection.updateOne(
        {_id: mongoose.Types.ObjectId(req.body.id)},
        [{
            $set: data,
        }])
        .then(() => {
            return res.status(200).json({msg: "The appointment has been accepted successfully."});
        })
        .catch(err => {
            return res.status(400).json({msg: err.toString()});
        });
});

router.all("/cancel-appointment", async (req, res) => {
    await Appointments.collection.updateOne({
        _id: mongoose.Types.ObjectId(req.body.id),
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
            return res.status(200).json({msg: "This appointment has deleted successfully."});
        }).catch(err => {
            return res.status(400).json({msg: err.toString()});
        })
});

router.all("/edit-appointment", async (req, res) => {
    Appointments.collection.updateOne(
        {_id: mongoose.Types.ObjectId(req.body.id)},
        [{
            $set: {
                payment: req.body.payment_amount,
                requested_date: new Date().toLocaleDateString([], {
                    year: 'numeric',
                    month: 'long',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                }),
            }
        }])
        .then(() => {
            return res.status(200).json({msg: "The appointment has updated successfully."});
        })
        .catch(err => {
            return res.status(400).json({msg: err.toString()});
        });
});

router.all("/update-invoice", async (req, res) => {
    const temp = await Appointments.findOne({
        _id: mongoose.Types.ObjectId(req.body.id)
    });
    console.log(temp)

    if(temp && (temp.payment !== req.body.price || temp.notes !== req.body.notes)) {
        Appointments.collection.updateOne(
            {_id: mongoose.Types.ObjectId(req.body.id)},
            [{
                $set: {
                    payment: req.body.price,
                    notes: req.body.notes,
                    updated_date: new Date().toUTCString([], {
                        year: 'numeric',
                        month: 'long',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                    }),
                    paid_date: undefined,
                    role_updated: 'provider',
                    state: 1,
                }
            }])
            .then(() => {
                return res.status(200).json({msg: "The invoice has updated successfully."});
            })
            .catch(err => {
                return res.status(400).json({msg: err.toString()});
            });
    } else {
        return res.status(200).json({msg: ''})
    }
});

router.all("/paid-appointment", async (req, res) => {
    Appointments.collection.updateOne(
        {_id: mongoose.Types.ObjectId(req.body.id)},
        [{
            $set: {
                state: 3, // The paid state by client
                paid_date: new Date().toLocaleDateString([], {
                    year: 'numeric',
                    month: 'long',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                }),
            }
        }])
        .then(() => {
            return res.status(200).json({msg: "The appointment accepted successfully."});
        })
        .catch(err => {
            return res.status(400).json({msg: err.toString()});
        });
});

/**
 * Updating the appointment reminders and requests
 */
router.all("/appointment-settings", async (req, res) => {
    await Users.collection.updateOne(
        {_id: mongoose.Types.ObjectId(req.body.id)},
        [{
            $set: {
                reminders: req.body.reminders,
                allow_requests: req.body.allow_requests,
                reminders_value: req.body.reminders_value,
                updated_date: new Date().toLocaleDateString([], {
                    year: 'numeric',
                    month: 'long',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                }),
            }
        }])
        .then(() => {
            let temp = {
                provider_id: req.body.id,
                $and: [{deleted_date: null}, {reminder_check: true}],
                $nor: [{state: 0}, ],
            };
            let update_data = {
                reminder_check: false,
                last_reminder_date: null,
            };

            Appointments.collection.updateOne(
                temp
                , [{$set: update_data}]).then(() => {
            }).then(() => {
                console.log("The reminder_check has updated.")
            }).catch(err => {
                console.log(err.toString());
            });
            return res.status(200).json({msg: "The appointment setting has updated successfully."});
        })
        .catch(err => {
            return res.status(400).json({msg: err.toString()});
        });
});

/**
 * Getting the appointment reminders and requests
 */
router.all("/get-allow-reminders", async (req, res) => {
    Users.findOne({_id: mongoose.Types.ObjectId(req.body.id)},
        ["-password", "-practice_name", "-photo", "-loggedIn_state", "-phone", "-updated_date", "-bgPhoto", "-bigPhoto", "-address1", "-address2",
            "-city", "-state_province", "-zip_code", "-country", "-about", "-cost", "-license_info", "-loggedIn_state", "-bgMusic", "-bgRoom", "-expertise", "-client_ids", "-provider_ids", "-provider_drags"]
    ).then(userInfo => {
        return res.status(200).json({results: userInfo});
    }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Appointment Grouping per day
 */
router.all("/get-appointment-grouping", async (req, res) => {
    let start = new Date();
    let end = new Date();
    let y = start.getFullYear();
    let m = start.getMonth();

    let yEnd = y, mEnd = m + 1;
    if(m === 11) {
        yEnd = y + 1;
        mEnd = 0;
    }

    start.setFullYear(y, m, 1);
    end.setFullYear(yEnd, mEnd, 1);
    start.setHours(0,0,0,0);
    end.setHours(0,0,0,0);

    let array = [];
    //let days = 30;
    /**
     * calc of the dates
     */
    let nArray = [31, 28, 31, 30, 31, 30, 31, 31,  30, 31, 30, 31,];
    let nMonth = start.getMonth();
    let days = nArray[nMonth];
    if(start.getFullYear() % 4 === 0 && nMonth === 1)
        days = 29;

    for (let k = 1; k <= days; k ++) {
        start = new Date();
        end = new Date();
        start.setFullYear(y, m, k);
        end.setFullYear(y, m, k);
        start.setHours(0,0,0,0);
        end.setHours(23,59,59,999);

        array.push({start, end});
    }

    //let sessionsPerDay = []; // appointment list per day
    let num_sessionsPerDay = []; // appointment count list per day
    let dateArray = []; // Date list of this month
    for (let k = 0; k < array.length; k ++) {
        let items = await Appointments.find({
            $nor: [{state: 0}],
            $and: [{deleted_date: null}, ],
            start_time: {$gte: array[k].start, $lt: array[k].end},
        });
        //sessionsPerDay.push(items);
        num_sessionsPerDay.push(items.length);
        dateArray.push(k + 1);
    }

    let data = {
        start: start,
        end: end,
        days: days,
        array: array,
        date: dateArray,
        session_num: num_sessionsPerDay,
    };
    return res.status(200).json({msg: "Successful", results: data});
});

/**
 * Appending the client name
 */
router.all("/get-clients-appointment", async (req, res) => {
    //await onReminders();
    let sWeekNumber = getWeekNumber(new Date());
    let data;
    let start = new Date();
    let end = new Date();

    //flag === 1: this day
    //flag === 2: this week
    // flag === 3: this month
    //flag === 4: invited list
    //flag === 5: requested List
    if (req.body.flag === 0) {
        if (req.body.role === 'provider') {
            data = {
                $and: [{deleted_date: null}, ],
                provider_id: req.body.id,
                $nor: [{state: 0}, {invite_client: true}],
            };
        } else {
            data = {
                $and: [{deleted_date: null},],
                //invitees_id: req.body.id,
                "invitees_id": {$elemMatch: {$eq: req.body.id}},
                $nor: [{state: 0}, {invite_client: true}],
            };
        }
    } else if (req.body.flag === 1) {
        start.setHours(0,0,0,0);
        end.setHours(23,59,59,999);

        if (req.body.role === 'provider') {
            data = {
                $and: [{deleted_date: null},],
                provider_id: req.body.id,
                $nor: [{state: 0}, {invite_client: true}],
                start_time: {$gte: start, $lt: end},
            };
        } else {
            data = {
                $and: [{deleted_date: null},],
                $nor: [{state: 0}, {invite_client: true}],
                "invitees_id": {$elemMatch: {$eq: req.body.id}},
                start_time: {$gte: start, $lt: end},
            };
        }
    } else if (req.body.flag === 2) {
        if (req.body.role === 'provider') {
            data = {
                $and: [{deleted_date: null},],
                $nor: [{state: 0}, {invite_client: true}],
                provider_id: req.body.id,
                week_number: sWeekNumber,
            };
        } else {
            data = {
                $and: [{deleted_date: null},],
                $nor: [{state: 0}, {invite_client: true}],
                "invitees_id": {$elemMatch: {$eq: req.body.id}},
                week_number: sWeekNumber,
            };
        }
    } else if (req.body.flag === 3) {
        let y = start.getFullYear();
        let m = start.getMonth();
        start.setFullYear(y, m, 1);
        end.setFullYear(y, m + 1, 1);
        start.setHours(0,0,0,0);
        end.setHours(0,0,0,0);

        if (req.body.role === 'provider') {
            data = {
                $and: [{deleted_date: null},],
                $nor: [{state: 0}, {invite_client: true}],
                provider_id: req.body.id,
                start_time: {$gte: start, $lt: end},
            };
        } else {
            data = {
                $and: [{deleted_date: null},],
                $nor: [{state: 0}, {invite_client: true}],
                "invitees_id": {$elemMatch: {$eq: req.body.id}},
                start_time: {$gte: start, $lt: end},
            };
        }
    } else if(req.body.flag === 4) {
        data = {
            $and: [{deleted_date: null}],
            provider_id: req.body.id,
            state: 0,
            $or: [{$nor: [{invite_email: null},]}, {$nor: [{invite_phone: null}]}],
        };
    } else if(req.body.flag === 5) {
        if (req.body.role === 'provider') {
            data = {
                $and: [{deleted_date: null}],
                provider_id: req.body.id,
                invite_client: true,
            };
        } else {
            data = {
                $and: [{deleted_date: null},],
                "invitees_id": {$elemMatch: {$eq: req.body.id}},
                invite_client: true,
            };
        }
    }

    const pagination = req.body.appointment_pagination ? parseInt(req.body.appointment_pagination) : 10;
    const page_number = req.body.appointment_current_page ? parseInt(req.body.appointment_current_page) : 1;
    const page_neighbours = req.body.appointment_page_neighbours ? parseInt(req.body.appointment_page_neighbours) : 1;

    const total_list_count = await Appointments.countDocuments(data);
    const total_page = Math.ceil(total_list_count / pagination);

    const start_page = Math.max(1, page_number - page_neighbours);
    const end_page = Math.min(total_page, page_number + page_neighbours);
    const page_num = {
        start_page: start_page,
        end_page: end_page,
        total_page: total_page,
        num_total: total_list_count,
    };

    let scrapData;
    if (req.body.role === 'provider') {
        scrapData = {
            from: 'users',
            let: {"invitees_id": "$invitees_id"},
            pipeline: [
                {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$invitees_id"]}}},
                {$project: {"name": 1, "photo": 1}}
            ],
            as: 'clientInfo'
        };
    } else {
        scrapData = {
            from: 'users',
            let: {"provider_id": "$provider_id"},
            pipeline: [
                {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$provider_id"]}}},
                {$project: {"name": 1, "photo": 1}}
            ],
            as: 'providerInfo'
        };
    }

    let filter_data;
    if(req.body.filter_string === undefined) {
        filter_data = {
            start_time: -1,
            state: 1,
            editable_state: -1,
        }
    } else {
        filter_data = req.body.filter_string;
    }

    if(req.body.flag === 4) {
        Appointments.aggregate([
            {$match: data}
        ]).collation({locale: 'en', strength: 2})
            .sort({requested_date: 1})
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
    } else {
        Appointments.aggregate([
            {$match: data},
            {
                $lookup: scrapData
            }
        ]).collation({locale: 'en', strength: 2})
            .sort(filter_data)
            .skip((page_number - 1) * pagination)
            .limit(pagination)
            .then(async item => {
                if (item) {
                    // Updating of the state value
                    for (let k = 0; k < item.length; k++) {
                        if(req.body.role === 'provider') {
                            let clientArray = [];
                            for (let i = 0; i < item[k].invitees_id.length; i ++) {
                                let clients = await Users.findOne({
                                    _id: mongoose.Types.ObjectId(item[k].invitees_id[i]),
                                }, ["-password", "-practice_name", "-photo", "-loggedIn_state", "-phone", "-updated_date", "-main_provider_id", "-role", "-stripe_customer", "-stripe_account_id", "-provider_ids", "-client_ids", "-provider_drags", "-client_drags", "-stripe_customer_id" , "-bgPhoto", "-bigPhoto", "-address1", "-address2",
                                    "-city", "-state_province", "-zip_code", "-country", "-about", "-cost", "-license_info", "-loggedIn_state", "-bgMusic", "-bgRoom", "-expertise",]);
                                clientArray.push(clients);
                            }
                            item[k].clientInfo = clientArray;
                        }

                        let appointmentStartTime = Math.floor((new Date(item[k].start_time)).getTime() / (1000 * 60));
                        let appointmentEndTime = Math.floor((new Date(item[k].end_time)).getTime() / (1000 * 60));
                        let current = Math.floor((new Date()).getTime() / (1000 * 60));

                        /**
                         * editable_state decision
                         */
                        let editable_state;
                        if(appointmentStartTime > current) {
                            if((item[k].state === 1 || item[k].state === 2 || item[k].state === 3 || item[k].state === 31) && (item[k].actual_start === undefined) && (item[k].paid_date === null || item[k].paid_date === undefined || item[k].payment === 0)) {
                                editable_state = 1;
                            } else {
                                editable_state = 0;
                            }
                        } else {
                            editable_state = 0;
                        }
                        if(item[k].state === 1 || item[k].state === 2) {
                            await Appointments.updateOne({
                                    _id: mongoose.Types.ObjectId(item[k]._id),
                                },
                                {
                                    editable_state: editable_state,
                                });
                            continue;
                        }

                        if(item[k].state !== 4) {
                            if (appointmentStartTime > current) {
                                //if(appointmentStartTime - current <= 20) {
                                if(item[k].state !== 5) {
                                    await Appointments.updateOne({
                                            _id: mongoose.Types.ObjectId(item[k]._id),
                                        },
                                        {
                                            state: 31, // Join for the appointment
                                            editable_state: editable_state,
                                        });
                                }
                                //}
                            } else if (appointmentEndTime > current) {
                                if(item[k].state !== 5) {
                                    await Appointments.updateOne({
                                            _id: mongoose.Types.ObjectId(item[k]._id),
                                        },
                                        {
                                            state: 32, // Start for the appointment
                                            editable_state: editable_state,
                                        });
                                }
                            } else {
                                await Appointments.updateOne({
                                        _id: mongoose.Types.ObjectId(item[k]._id),
                                    },
                                    {
                                        state: 6, // the appointment already passed
                                        editable_state: editable_state,
                                    });
                            }
                        } else {
                            if (appointmentEndTime > current && appointmentStartTime < current) {
                                await Appointments.updateOne({
                                        _id: mongoose.Types.ObjectId(item[k]._id),
                                    },
                                    {
                                        state: 4, // In progressing for the appointment
                                        editable_state: editable_state,
                                    });
                            } else if (appointmentEndTime < current){
                                await Appointments.updateOne({
                                        _id: mongoose.Types.ObjectId(item[k]._id),
                                    },
                                    {
                                        state: 5, // the appointment already finished
                                        editable_state: editable_state,
                                        join_state: 0,
                                    });
                            }
                        }
                    }
                    const result = {
                        list: item,
                        page_num: page_num,
                    };
                    return res.status(200).json({msg: 'An appointments list got successfully.', results: result});
                }
            }).catch(err => {
            console.log(err.toString());
            return res.status(400).json({msg: err.toString()});
        });
    }

    function getWeekNumber(d) {
        // Copy date so don't modify original
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        // Set to nearest Thursday: current date + 4 - current day number
        // Make Sunday's day number 7
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        // Get first day of year
        let yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        // Calculate full weeks to nearest Thursday
        let weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        // Return array of year and week number
        return weekNo;
    }
});

/**
 * Appending the provider name
 */
router.all("/get-providers-appointment", async (req, res) => {
    Appointments.aggregate([
        {$and: [{deleted_date: null}, {$nor: [{state: 0}]}],},
        {
            $lookup:
                {
                    from: 'users',
                    let: {"provider_id": "$provider_id"},
                    pipeline: [
                        {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$provider_id"]}}},
                        {$project: {"name": 1, "photo": 1}}
                    ],
                    as: 'providerInfo'
                }
        }
    ]).collation({locale: 'en', strength: 2})
        .sort({start_time: 1})
        .then(appointmentList => {
            if (appointmentList) {
                return res.status(200).json({
                    msg: 'An appointments list got successfully.',
                    results: [...appointmentList]
                });
            } else {
                console.log('The appointments can not find.');
                return res.status(400).json({msg: 'The appointments can not find.'});
            }
        }).catch(err => {
        console.log(err.toString());
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Getting of appointment requested list
 */
router.all("/get-request-appointment", async (req, res) => {
    const data = {
        $and: [{deleted_date: null}],
        invitees_id: req.body.id,
        state: 1,
    };

    Appointments.aggregate([
        {$match: data},
        {
            $lookup:
                {
                    from: 'users',
                    let: {"provider_id": "$provider_id"},
                    pipeline: [
                        {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$provider_id"]}}},
                        {$project: {"name": 1, "photo": 1}}
                    ],
                    as: 'providerInfo'
                }
        }
    ]).collation({locale: 'en', strength: 2})
        .sort({start_time: 1})
        .then(appointmentList => {
            if (appointmentList) {
                return res.status(200).json({msg: 'An appointments list got successfully.', results: appointmentList});
            } else {
                console.log('The appointments can not find.');
                return res.status(400).json({msg: 'The appointments can not find.'});
            }
        }).catch(err => {
        console.log(err.toString());
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Getting of payment request appointment list for client
 */
router.all("/get-payment-appointment", async (req, res) => {
    let data;
    if (req.body.state === 1) {
        data = {
            $and: [{deleted_date: null}],
            invitees_id: req.body.id,
            state: 2,
        };
    } else {
        data = {
            $and: [{deleted_date: null}],
            invitees_id: req.body.id,
            state: 2,
        };
    }
    const pagination = req.body.pagination ? parseInt(req.body.pagination) : 10;
    const page_number = req.body.current_page ? parseInt(req.body.current_page) : 1;
    const page_neighbours = req.body.page_neighbours ? parseInt(req.body.page_neighbours) : 1;

    const total_list_count = await Appointments.collection.countDocuments(data);
    const total_page = Math.ceil(total_list_count/pagination);

    const start_page = Math.max(1, page_number - page_neighbours);
    const end_page = Math.min(total_page, page_number + page_neighbours);
    const page_num = {
        start_page: start_page,
        end_page: end_page,
        total_page: total_page,
    };
    Appointments.aggregate([
        {$match: data},
        {
            $lookup:
                {
                    from: 'users',
                    let: {"provider_id": "$provider_id"},
                    pipeline: [
                        {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$provider_id"]}}},
                        {$project: {"name": 1, "photo": 1}}
                    ],
                    as: 'providerInfo'
                }
        }
    ])
        .collation({locale: 'en', strength: 2})
        .sort({start_time: 1})
        .skip((page_number - 1) * pagination)
        .limit(pagination)
        .then(appointmentList => {
            if (appointmentList) {
                const result = {
                    list: appointmentList,
                    page_num: page_num,
                };
                return res.status(200).json({msg: 'An appointments list got successfully.', results: result});
            } else {
                return res.status(400).json({msg: 'The appointments can not find.'});
            }
        }).catch(err => {
        console.log(err.toString());
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Getting of paid appointment list
 */
router.all("/get-paid-appointment", async (req, res) => {
    const data = {
        $and: [{deleted_date: null}, {'paid_date': {$exists: true, $ne: null}}, ],
        invitees_id: req.body.id,
        //$or: [{payment: 0}, {'paid_date': {$exists: true, $ne: null}},],
    };
    const pagination = req.body.history_pagination ? parseInt(req.body.history_pagination) : 10;
    const page_number = req.body.history_current_page ? parseInt(req.body.history_current_page) : 1;
    const page_neighbours = req.body.history_page_neighbours ? parseInt(req.body.history_page_neighbours) : 1;

    const total_list_count = await Appointments.collection.countDocuments(data);
    const total_page = Math.ceil(total_list_count/pagination);

    const start_page = Math.max(1, page_number - page_neighbours);
    const end_page = Math.min(total_page, page_number + page_neighbours);
    const page_num = {
        start_page: start_page,
        end_page: end_page,
        total_page: total_page,
    };
    Appointments.aggregate([
        {$match: data},
        {
            $lookup:
                {
                    from: 'users',
                    let: {"provider_id": "$provider_id"},
                    pipeline: [
                        {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$provider_id"]}}},
                        {$project: {"name": 1, "photo": 1}}
                    ],
                    as: 'providerInfo'
                }
        }
    ])
        .collation({locale: 'en', strength: 2})
        .sort({start_time: -1})
        .skip((page_number - 1) * pagination)
        .limit(pagination)
        .then(appointmentList => {
            if (appointmentList) {
                const result = {
                    list: appointmentList,
                    page_num: page_num,
                };
                return res.status(200).json({msg: 'An appointments list got successfully.', results: result});
            } else {
                console.log('The appointments can not find.');
                return res.status(400).json({msg: 'The appointments can not find.'});
            }
        }).catch(err => {
        console.log(err.toString());
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Getting of appointment requested list on provider-side
 */
router.all("/get-request-provider", async (req, res) => {
    const data = {
        $and: [{deleted_date: null}],
        provider_id: req.body.id,
        state: 2,
        // $nor: [{state: 6}],
    };

    const pagination = req.body.pagination ? parseInt(req.body.pagination) : 10;
    const page_number = req.body.current_page ? parseInt(req.body.current_page) : 1;
    const page_neighbours = req.body.page_neighbours ? parseInt(req.body.page_neighbours) : 1;

    const total_list_count = await Appointments.collection.countDocuments(data);
    const total_page = Math.ceil(total_list_count/pagination);

    const start_page = Math.max(1, page_number - page_neighbours);
    const end_page = Math.min(total_page, page_number + page_neighbours);
    const page_num = {
        start_page: start_page,
        end_page: end_page,
        total_page: total_page,
    };
    Appointments.aggregate([
        {$match: data},
        {
            $lookup:
                {
                    from: 'users',
                    let: {"invitees_id": "$invitees_id"},
                    pipeline: [
                        {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$invitees_id"]}}},
                        {$project: {"name": 1, "photo": 1}}
                    ],
                    as: 'clientInfo'
                }
        }
    ])
        .collation({locale: 'en', strength: 2})
        .sort({start_time: 1})
        .skip((page_number - 1) * pagination)
        .limit(pagination)
        .then(async appointmentList => {
            if (appointmentList) {
                for(let k = 0; k < appointmentList.length; k++) {
                    let clientArray = [];
                    for (let i = 0; i < appointmentList[k].invitees_id.length; i ++) {
                        let clients = await Users.findOne({
                            _id: mongoose.Types.ObjectId(appointmentList[k].invitees_id[i]),
                        }, ["-password", "-practice_name", "-photo", "-loggedIn_state", "-phone", "-updated_date", "-main_provider_id", "-role", "-stripe_customer", "-stripe_account_id", "-provider_ids", "-client_ids", "-provider_drags", "-client_drags", "-stripe_customer_id" , "-bgPhoto", "-bigPhoto", "-address1", "-address2",
                            "-city", "-state_province", "-zip_code", "-country", "-about", "-cost", "-license_info", "-loggedIn_state", "-bgMusic", "-bgRoom", "-expertise",]);

                        clientArray.push(clients);
                    }

                    appointmentList[k].clientInfo = clientArray;
                }

                const result = {
                    list: appointmentList,
                    page_num: page_num,
                };
                return res.status(200).json({msg: 'An appointments list got successfully.', results: result});
            } else {
                return res.status(400).json({msg: 'The appointments can not find.'});
            }
        }).catch(err => {
        console.log(err.toString());
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * Getting of paid appointment list on provider-side
 */
router.all("/get-paid-provider", async (req, res) => {
    const data = {
        $and: [{deleted_date: null}, {'paid_date': {$exists: true, $ne: null}}, ],
        provider_id: req.body.id,
        $nor: [{state: 1}, {state: 2}],
        //$or: [{payment: 0}, {'paid_date': {$exists: true, $ne: null}},],
    };
    const pagination = req.body.history_pagination ? parseInt(req.body.history_pagination) : 10;
    const page_number = req.body.history_current_page ? parseInt(req.body.history_current_page) : 1;
    const page_neighbours = req.body.history_page_neighbours ? parseInt(req.body.history_page_neighbours) : 1;

    const total_list_count = await Appointments.collection.countDocuments(data);
    const total_page = Math.ceil(total_list_count/pagination);

    const start_page = Math.max(1, page_number - page_neighbours);
    const end_page = Math.min(total_page, page_number + page_neighbours);
    const page_num = {
        start_page: start_page,
        end_page: end_page,
        total_page: total_page,
    };
    Appointments
        .aggregate([
            {$match: data},
            {
                $lookup:
                    {
                        from: 'users',
                        let: {"invitees_id": "$invitees_id"},
                        pipeline: [
                            {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$invitees_id"]}}},
                            {$project: {"name": 1, "photo": 1}}
                        ],
                        as: 'clientInfo'
                    }
            }
        ])
        .collation({locale: 'en', strength: 2})
        .skip((page_number - 1) * pagination)
        .limit(pagination)
        .then(async appointmentList => {
            if (appointmentList) {
                for(let k = 0; k < appointmentList.length; k++) {
                    let clientArray = [];
                    for (let i = 0; i < appointmentList[k].invitees_id.length; i ++) {
                        let clients = await Users.findOne({
                            _id: mongoose.Types.ObjectId(appointmentList[k].invitees_id[i]),
                        }, ["-password", "-practice_name", "-photo", "-loggedIn_state", "-phone", "-updated_date", "-main_provider_id", "-role", "-stripe_customer", "-stripe_account_id", "-provider_ids", "-client_ids", "-provider_drags", "-client_drags", "-stripe_customer_id" , "-bgPhoto", "-bigPhoto", "-address1", "-address2",
                            "-city", "-state_province", "-zip_code", "-country", "-about", "-cost", "-license_info", "-loggedIn_state", "-bgMusic", "-bgRoom", "-expertise",]);
                        clientArray.push(clients);
                    }
                    appointmentList[k].clientInfo = clientArray;
                }
                const result = {
                    list: appointmentList,
                    page_num: page_num,
                };
                return res.status(200).json({msg: 'An appointments list got successfully.', results: result});
            } else {
                return res.status(400).json({msg: 'The appointments can not find.'});
            }
        }).catch(err => {
        console.log(err.toString());
        return res.status(400).json({msg: err.toString()});
    });
});

/**
 * req.body {
 *  appointment_id: {string},
 *  provider_id: {string},
 *  amount: {number} in cents
 * }
 */
router.all("/pay", async (req, res) => {
    const user = await Users.findOne({
        _id: mongoose.Types.ObjectId(req.body.provider_id),
    });

    await Appointments.updateOne({
            _id: mongoose.Types.ObjectId(req.body.appointment_id),
        },
        {
            state: 3,
            paid_date: new Date().toLocaleDateString([], {
                year: 'numeric',
                month: 'long',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            }),
        });

    if (user && user.stripe_account_id) {
        // pay to seller
        // const paymentIntent = await stripe.paymentIntents.create({
        // 	payment_method_types: ['card'],
        // 	amount: req.body.amount,
        // 	currency: 'usd',
        // 	application_fee_amount: 0,
        // 	transfer_data: {
        // 		destination: user.stripe_account_id,
        // 	},
        // });

        try {
            const transfer = await stripe.transfers.create({
                amount: req.body.amount,
                currency: 'usd',
                destination: user.stripe_account_id,
                transfer_group: `paid for a appointment ${req.body.appointment_id}`,
            });
        } catch (e) {
            return res.status(500).json({msg: e.toString()});
        }

        // update appointment status
        await Appointments.updateOne({
                _id: mongoose.Types.ObjectId(req.body.appointment_id),
            },
            {
                state: 3,
                paid_date: new Date().toLocaleDateString([], {
                    year: 'numeric',
                    month: 'long',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                }),
            });
    } else {
        return res.status(500).json({msg: 'The provide has not a Stripe account yet. Please try it later.'});
    }
    return res.status(200).json({data: req.body});
});

/**
 * Appending the client name
 */
router.all("/get-appointment", async (req, res) => {
    let data;
    let scrapData;

    data = {
        _id: mongoose.Types.ObjectId(req.body.id),
    };

    if (req.body.role === "client" || req.body.role === "invited") {
        scrapData = {
            from: 'users',
            let: {"provider_id": "$provider_id"},
            pipeline: [
                {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$provider_id"]}}},
                {$project: {"name": 1, "photo": 1, "bgMusic": 1, "bgRoom": 1,}}
            ],
            as: 'userInfo'
        }
    } else {
        scrapData = {
            from: 'users',
            let: {"invitees_id": "$invitees_id"},
            pipeline: [
                {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$invitees_id"]}}},
                {$project: {"name": 1, "photo": 1}}
            ],
            as: 'userInfo'
        };
    }

    Appointments.aggregate([
        {$match: data},
        {
            $lookup: scrapData
        }
    ]).then(appointment => {
        if (appointment) {
            console.log('An appointment got successfully.');
            return res.status(200).json({msg: 'An appointment got successfully.', results: appointment});
        } else {
            console.log('The appointment can not find.');
            return res.status(400).json({msg: 'The appointment can not find.'});
        }
    }).catch(err => {
        console.log(err.toString());
        return res.status(400).json({msg: err.toString()});
    });
});

////////////////////////////////////////////////////////
router.all("/allow-appointment", async (req, res) => {
    let temp = await Appointments.findOne({_id: mongoose.Types.ObjectId(req.body.id)});
    let current = Math.floor((new Date()).getTime() / (1000 * 60));
    let appointmentEndTime = temp.end_time? Math.floor((new Date(temp.end_time)).getTime() / (1000 * 60)): current + 1;

    if(appointmentEndTime > current) { // joining at any time
        await Appointments.collection.updateOne(
            {_id: mongoose.Types.ObjectId(req.body.id)},
            [{
                $set: {
                    join_state: 1,
                    allow: req.body.allow,
                }
            }])
            .then(() => {
                return res.status(200).json({results: req.body.allow});
            }).catch(err => {
                console.log("error = ", err.toString());
                return res.status(400).json({msg: err.toString()});
            });

    } else {
        await Appointments.collection.updateOne(
            {_id: mongoose.Types.ObjectId(req.body.id)},
            [{
                $set: {
                    allow: false,
                }
            }])
            .then(() => {
                console.log("The meeting time is already passed");
                return res.status(400).json({msg: "The meeting time is already passed."})
            }).catch(err => {
                console.log("error 222222222222 = ", err.toString());
                return res.status(400).json({msg: err.toString()});
            });
    }
});

const sendEventsToAppointmentStatus = (data) => {
    usersForAppointmentStatus.forEach((user) => {
        if (user.reqType === data.id) {
            console.log(user.reqType, "=========================", data)
            const sseFormattedResponse = `data: ${JSON.stringify(data.allow)}\n\n`;
            user.res.write(sseFormattedResponse);
        }
    })
};
router.all("/send-allow-appointment", async (req, res) => {
    try {
        sendEventsToAppointmentStatus(req.body);
        return res.status(200).json({msg: "successful"})
    } catch (err) {
        return res.status(400).json({msg: err.toString()});
    }
});

/////////////////////////////////////////////////////
/**
 * Joining to the appointment
 */

router.all("/join-appointment", async (req, res) => {
    const temp = await Appointments.findOne({_id: mongoose.Types.ObjectId(req.body.id)});
    if(temp.state === 5) {
        return res.status(400).json({msg: "This session already has finished."})
    }

    if(req.body.role === "provider") {
        let appointmentStartTime = Math.floor((new Date(temp.start_time)).getTime() / (1000 * 60));
        let current = Math.floor((new Date()).getTime() / (1000 * 60));
        let appointmentEndTime = temp.end_time? Math.floor((new Date(temp.end_time)).getTime() / (1000 * 60)): current + 1;
        //if(temp.state !== 1 && temp.state !== 2 && temp.state !== 3) {
        // if(appointmentStartTime < current && appointmentEndTime > current) {
        if(appointmentEndTime > current) { // joining at any time
            Appointments.collection.updateOne(
                {_id: mongoose.Types.ObjectId(req.body.id)},
                [{
                    $set: {
                        //state: 4, // The joined state by the provider
                        join_state: 1,
                        allow: false,
                    }
                }])
                .then(() => {
                    console.log("The provider joined successfully.");
                    return res.status(200).json({msg: "You have joined successfully."});
                })
                .catch(err => {
                    console.log("The appointment joining failed.", err.toString());
                    return res.status(400).json({msg: err.toString()});
                });
        } else {
            Appointments.collection.updateOne(
                {_id: mongoose.Types.ObjectId(req.body.id)},
                [{
                    $set: {
                        join_state: 0,
                        allow: false,
                    }
                }])
                .then(() => {
                })
                .catch(err => {
                    return res.status(400).json({msg: err.toString()});
                });
            return res.status(400).json({msg: "This appointment is already over time."})
        }
        //}
    } else {
        if(temp.join_state !== 1 || temp.allow !== true) {
            console.log("The provider has not joined yet. Please wait for him to join.");
            return res.status(400).json({msg: "The provider has not joined yet. Please wait for him to join."});
        } else {
            let ids = temp.join_client_ids;
            if (ids.indexOf(req.body.client_id) === -1) {
                ids.push(req.body.client_id);
            }
            let setData;

            if(req.body.start_session === true && !temp.actual_start) {
                setData = {
                    state: temp.state === 0? 0: 4, // Start-state
                    join_client_ids: ids,
                    actual_start: new Date().toUTCString([], {
                        year: 'numeric',
                        month: 'long',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                    }),
                }
            } else {
                setData = {
                    state: temp.state === 0? 0: 4, // Start-state
                    join_client_ids: ids,
                }
            }
            await Appointments.collection.updateOne(
                {_id: mongoose.Types.ObjectId(req.body.id)},
                [{
                    $set: setData,
                }])
                .then(() => {
                    console.log("The joining succeed.");
                    return res.status(200).json({msg: "The joining succeed."});
                })
                .catch(err => {
                    console.log("The appointment joining failed.", err.toString());
                    return res.status(400).json({msg: "The appointment joining failed."});
                });
        }
    }
});
/**
 * Going out the appointment
 */
router.all("/out-appointment", async (req, res) => {
    const temp = await Appointments.findOne({_id: mongoose.Types.ObjectId(req.body.id)});
    if (temp) {
        if(req.body.role === 'provider') {
            let setData;
            if(req.body.start_session === true && temp.actual_start) {
                setData = {
                    join_state: 0,
                    allow: false,
                    state: temp.state === 0? 0: 5,
                    actual_end: new Date().toUTCString([], {
                        year: 'numeric',
                        month: 'long',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                    }),
                }
            } else {
                setData = {
                    join_state: 0,
                    allow: false,
                }
            }

            Appointments.collection.updateOne(
                {_id: mongoose.Types.ObjectId(req.body.id)},
                [{
                    $set: setData,
                }])
                .then(() => {
                    return res.status(200).json({msg: "You have left the session successfully."});
                })
                .catch(err => {
                    console.log("The appointment joining has failed.", err.toString());
                    return res.status(400).json({msg: err.toString()});
                });
        } else {
            console.log("============ ", temp.join_client_ids);
            let ids = temp.join_client_ids;
            ids.splice(ids.indexOf(req.body.client_id), 1);
            console.log(ids);
            Appointments.collection.updateOne(
                {_id: mongoose.Types.ObjectId(req.body.id)},
                [{
                    $set: {
                        join_client_ids: ids,
                    }
                }])
                .then(() => {
                    return res.status(200).json({msg: "The other has went out."});
                })
                .catch(err => {
                    console.log("The appointment joining has failed.", err.toString());
                    return res.status(400).json({msg: err.toString()});
                });
        }
    } else {
        return res.status(400).json({msg: "Not existing."})
    }
});
/**
 * Getting appointment list to one client and one provider
 * Getting the session list to one client and one provider
 * @type {Router}
 */
router.all("/appointment-one-one", async (req, res) => {
    let sWeekNumber = getWeekNumber(new Date());
    let data = {
        $and: [{deleted_date: null},],
        $nor: [{state: 0},],
        provider_id: req.body.provider_id,
    };
    let start = new Date();
    let end = new Date();

    await Appointments.aggregate([
        {$match: data}
    ]).then(async item => {
        if (item) {
            // Updating of the state value
            for (let k = 0; k < item.length; k++) {
                let appointmentStartTime = Math.floor((new Date(item[k].start_time)).getTime() / (1000 * 60));
                let appointmentEndTime = Math.floor((new Date(item[k].end_time)).getTime() / (1000 * 60));
                let current = Math.floor((new Date()).getTime() / (1000 * 60));
                /**
                 * editable_state decision
                 */
                let editable_state;
                if(appointmentStartTime > current) {
                    if((item[k].state === 1 || item[k].state === 2 || item[k].state === 3 || item[k].state === 31) && (item[k].actual_start === undefined) && (item[k].paid_date === null || item[k].paid_date === undefined || item[k].payment === 0)) {
                        editable_state = 1;
                    } else {
                        editable_state = 0;
                    }
                } else {
                    editable_state = 0;
                }
                if(item[k].state === 1 || item[k].state === 2) {
                    await Appointments.updateOne({
                            _id: mongoose.Types.ObjectId(item[k]._id),
                        },
                        {
                            editable_state: editable_state,
                        });
                    continue;
                }

                if(item[k].state !== 4) {
                    if (appointmentStartTime > current) {
                        //if(appointmentStartTime - current <= 20) {
                        if(item[k].state !== 5) {
                            await Appointments.updateOne({
                                    _id: mongoose.Types.ObjectId(item[k]._id),
                                },
                                {
                                    state: 31, // Join for the appointment
                                    editable_state: editable_state,
                                });
                        }
                        //}
                    } else if (appointmentEndTime > current) {
                        if(item[k].state !== 5) {
                            await Appointments.updateOne({
                                    _id: mongoose.Types.ObjectId(item[k]._id),
                                },
                                {
                                    state: 32, // Start for the appointment
                                    editable_state: editable_state,
                                });
                        }
                    } else {
                        await Appointments.updateOne({
                                _id: mongoose.Types.ObjectId(item[k]._id),
                            },
                            {
                                state: 6, // the appointment already passed
                                editable_state: editable_state,
                            });
                    }
                } else {
                    if (appointmentEndTime > current && appointmentStartTime < current) {
                        await Appointments.updateOne({
                                _id: mongoose.Types.ObjectId(item[k]._id),
                            },
                            {
                                state: 4, // In progressing for the appointment
                                editable_state: editable_state,
                            });
                    } else if (appointmentEndTime < current){
                        await Appointments.updateOne({
                                _id: mongoose.Types.ObjectId(item[k]._id),
                            },
                            {
                                state: 5, // the appointment already finished
                                join_state: 0,
                                editable_state: editable_state,
                            });
                    }
                }
            }
        }
        return null;
    }).catch(err => {
        return res.status(400).json({msg: err.toString()});
    });

    if(req.body.btn_state === 1) {
        //flag === 1: this day
        //flag === 2: this week
        // flag === 3: this month
        if (req.body.flag === 0) {
            data = {
                $and: [{deleted_date: null},],
                provider_id: req.body.provider_id,
                invitees_id: {$elemMatch: {$eq: req.body.client_id}},
                $nor: [{invite_client: true,}]
            };
        } else if (req.body.flag === 1) {
            start.setHours(0,0,0,0);
            end.setHours(23,59,59,999);

            data = {
                $and: [{deleted_date: null},],
                provider_id: req.body.provider_id,
                invitees_id: {$elemMatch: {$eq: req.body.client_id}},
                start_time: {$gte: start, $lt: end},
                $nor: [{invite_client: true,}]
            };
        } else if (req.body.flag === 2) {
            data = {
                $and: [{deleted_date: null}],
                provider_id: req.body.provider_id,
                invitees_id: {$elemMatch: {$eq: req.body.client_id}},
                week_number: sWeekNumber,
                $nor: [{invite_client: true,}]
            };
        } else if (req.body.flag === 3) {
            let y = start.getFullYear();
            let m = start.getMonth();
            start.setFullYear(y, m, 1);
            end.setFullYear(y, m + 1, 1);
            start.setHours(0,0,0,0);
            end.setHours(0,0,0,0);
            data = {
                $and: [{deleted_date: null}],
                provider_id: req.body.provider_id,
                invitees_id: {$elemMatch: {$eq: req.body.client_id}},
                start_time: {$gte: start, $lt: end},
                $nor: [{invite_client: true,}]
            };
        } else if (req.body.flag === 5) {
            data = {
                $and: [{deleted_date: null}],
                provider_id: req.body.provider_id,
                invitees_id: {$elemMatch: {$eq: req.body.client_id}},
                invite_client: true,
            };
        }
    } else if(req.body.btn_state === 2) {
        /**
         * The appointment
         * @type {{invitees_id: {$elemMatch: {$eq: string}}, $and: [{deleted_date: null}], $or: [{payment: number}, {paid_date: {$exists: boolean, $ne: null}}], provider_id: *}}
         */
        data = {
            $and: [{deleted_date: null},],
            provider_id: req.body.provider_id,
            invitees_id: {$elemMatch: {$eq: req.body.client_id}},
            $nor: [{state: 5}, {state: 6}],
            // $or: [{payment: 0}, {'paid_date': {$exists: true, $ne: null}},],
        };
    } else if(req.body.btn_state === 3) {
        data = {
            $and: [{deleted_date: null},],
            provider_id: req.body.provider_id,
            invitees_id: {$elemMatch: {$eq: req.body.client_id}},
            $or: [{payment: 0}, {'paid_date': {$exists: true, $ne: null}},],
        };
    }

    const pagination = req.body.appointment_pagination ? parseInt(req.body.appointment_pagination) : 10;
    const page_number = req.body.appointment_current_page ? parseInt(req.body.appointment_current_page) : 1;
    const page_neighbours = req.body.appointment_page_neighbours ? parseInt(req.body.appointment_page_neighbours) : 1;

    const total_list_count = await Appointments.countDocuments(data);
    const total_page = Math.ceil(total_list_count / pagination);

    const start_page = Math.max(1, page_number - page_neighbours);
    const end_page = Math.min(total_page, page_number + page_neighbours);
    const page_num = {
        start_page: start_page,
        end_page: end_page,
        total_page: total_page,
        num_total: total_list_count,
    };
    await Appointments.aggregate([
        {$match: data},
    ])
        .collation({locale: 'en', strength: 2})
        .skip((page_number - 1) * pagination)
        .limit(pagination)
        .then(async item => {
            if (item) {
                // Updating of the state value
                for (let k = 0; k < item.length; k++) {
                    let clientArray = [];
                    for (let i = 0; i < item[k].invitees_id.length; i ++) {
                        let clients = await Users.findOne({
                            _id: mongoose.Types.ObjectId(item[k].invitees_id[i]),
                        }, ["-password", "-practice_name", "-photo", "-loggedIn_state", "-phone", "-updated_date", "-main_provider_id", "-role", "-stripe_customer", "-stripe_account_id", "-provider_ids", "-client_ids", "-provider_drags", "-client_drags", "-stripe_customer_id" , "-bgPhoto", "-bigPhoto", "-address1", "-address2",
                            "-city", "-state_province", "-zip_code", "-country", "-about", "-cost", "-license_info", "-loggedIn_state", "-bgMusic", "-bgRoom", "-expertise",]);

                        clientArray.push(clients);
                    }
                    item[k].clientInfo = clientArray;
                    let appointmentStartTime = Math.floor((new Date(item[k].start_time)).getTime() / (1000 * 60));
                    let appointmentEndTime = Math.floor((new Date(item[k].end_time)).getTime() / (1000 * 60));
                    let current = Math.floor((new Date()).getTime() / (1000 * 60));
                    /**
                     * editable_state decision
                     */
                    let editable_state;
                    if(appointmentStartTime > current) {
                        if((item[k].state === 1 || item[k].state === 2 || item[k].state === 3 || item[k].state === 31) && (item[k].actual_start === undefined) && (item[k].paid_date === null || item[k].paid_date === undefined || item[k].payment === 0)) {
                            editable_state = 1;
                        } else {
                            editable_state = 0;
                        }
                    } else {
                        editable_state = 0;
                    }
                    if(item[k].state === 1 || item[k].state === 2) {
                        await Appointments.updateOne({
                                _id: mongoose.Types.ObjectId(item[k]._id),
                            },
                            {
                                editable_state: editable_state,
                            });
                        continue;
                    }

                    if(item[k].state !== 4) {
                        if (appointmentStartTime > current) {
                            //if(appointmentStartTime - current <= 20) {
                            if(item[k].state !== 5) {
                                await Appointments.updateOne({
                                        _id: mongoose.Types.ObjectId(item[k]._id),
                                    },
                                    {
                                        state: 31, // Join for the appointment
                                    });
                            }
                            //}
                        } else if (appointmentEndTime > current) {
                            if(item[k].state !== 5) {
                                await Appointments.updateOne({
                                        _id: mongoose.Types.ObjectId(item[k]._id),
                                    },
                                    {
                                        state: 32, // Start for the appointment
                                    });
                            }
                        } else {
                            await Appointments.updateOne({
                                    _id: mongoose.Types.ObjectId(item[k]._id),
                                },
                                {
                                    state: 6, // the appointment already passed
                                });
                        }
                    } else {
                        if (appointmentEndTime > current && appointmentStartTime < current) {
                            await Appointments.updateOne({
                                    _id: mongoose.Types.ObjectId(item[k]._id),
                                },
                                {
                                    state: 4, // In progressing for the appointment
                                });
                        } else if (appointmentEndTime < current){
                            await Appointments.updateOne({
                                    _id: mongoose.Types.ObjectId(item[k]._id),
                                },
                                {
                                    state: 5, // the appointment already finished
                                    join_state: 0,
                                });
                        }
                    }
                }
                const result = {
                    list: item,
                    page_num: page_num,
                };
                return res.status(200).json({msg: 'An appointments list has got successfully.', results: result});
            } else {
                return res.status(400).json({msg: 'The appointments can not find.'});
            }
        }).catch(err => {
            console.log(err.toString());
            return res.status(400).json({msg: err.toString()});
        });

    function getWeekNumber(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        let yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        let weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return weekNo;
    }
});

/**
 * Invite via email or phone
 * @type {Router}
 * inviting via phone when type = 2, via email when type = 1
 */
router.all("/appointment-invite", async (req, res) => {
    const temp = await Appointments.findOne({_id: mongoose.Types.ObjectId(req.body.appointment_id)});
    if(temp === null || temp.invite_email !== undefined || temp.invite_phone !== undefined) {
        return res.status(400).json({msg: "Please refresh once more and try again."})
    }

    if(req.body.type === 1) {
        if(req.body.email === '') {
            return res.status(400).json({msg: "Please input the email address."});
        }

        let path = config.CLIENT_URL + "/invited-session/" + req.body.appointment_id;
        let send_message = `<p>Hello, this is ${req.body.name} - please join me for a secure video call:</p>
                        <div style="background-color: lavenderblush">
                            <p style="padding: 15px">Declining this invitation will not inform your provider or update your appointment with teletherapist. If you need to modify or cancel, please contact your provider.</p>
                        </div>
                        <div style="display: flex; align-items: center; justify-content: center; background-color: #0CABC7; width: 70px; height: 30px">
                             <a href='${path}' style="text-align: center; align-items: center; justify-content: center; color: #fff; font-size: 16px; text-decoration: none;">
                                Join
                             </a>
                        </div>                                                
                        <p>Take care!</p><p>Teletherapist</p>`;
        let mailOptions = {
            from: config.MAIL_SENDER,
            to: req.body.email,

            subject: 'TeleTherapist: Appointment Invitation',
            html: send_message,
        };

        let transporter = await nodemailerCreate();

        transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
                return res.status(400).json({msg: error.toString()});
            } else {
                Appointments.collection.updateOne(
                    {_id: mongoose.Types.ObjectId(req.body.appointment_id)},
                    [{
                        $set: {
                            invite_email: req.body.email,
                            start_time: new Date().toUTCString([], {
                                year: 'numeric',
                                month: 'long',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                            }),
                            requested_date: new Date().toUTCString([], {
                                year: 'numeric',
                                month: 'long',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                            }),
                        }
                    }]);
                return res.status(200).json({msg: "Your email invitation succeed."})
            }
        });
    } else {
        /**
         * Text message code
         */
        if(req.body.provider_phone === '') {
            return res.status(400).json({msg: "Please try again after registering your phone number."});
        }

        if(req.body.phone === '') {
            return res.status(400).json({msg: "Please input the client's phone number."});
        }

        let path = config.CLIENT_URL + "/invited-session/" + req.body.appointment_id;
        let send_message = `<p>Hello, this is ${req.body.name} - please join me for a secure video call:</p>                                                
                        <div style="background-color: lavenderblush">
                            <p style="padding: 15px">Declining this invitation will not inform your provider or update your appointment with teletherapist. If you need to modify or cancel, please contact your provider.</p>
                        </div>                    
                        <div style="display: flex; align-items: center; justify-content: center; background-color: #0CABC7; width: 70px; height: 30px">
                             <a href='${path}' style="text-align: center; align-items: center; justify-content: center; color: #fff; font-size: 16px; text-decoration: none;">
                                Join
                             </a>
                        </div>    
                        <p>Take care!</p><p>Teletherapist</p>`;
        client.messages
            .create({
                body: send_message,
                //from: req.body.provider_phone,
                from: config.SMS_CONFIG.phone,
                to: '+' + req.body.phone,
            })
            .then(message => {
                Appointments.collection.updateOne(
                    {_id: mongoose.Types.ObjectId(req.body.appointment_id)},
                    [{
                        $set: {
                            invite_phone: req.body.phone,
                            start_time: new Date().toUTCString([], {
                                year: 'numeric',
                                month: 'long',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                            }),
                            requested_date: new Date().toUTCString([], {
                                year: 'numeric',
                                month: 'long',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                            }),
                        }
                    }]);
                console.log("SMS Message SID = ", message.sid);
                return res.status(200).json({msg: "Your text invitation has succeed."})
            }).catch(err => {

            console.log("sms error = ", err.toString());
            return res.status(400).json({msg: err.toString()});
        });
    }
});

/**
 * Get full month appointment list
 */
router.all("/get-month-appointment", async (req, res) => {
    let data;
    data = {
        $and: [{deleted_date: null}, ],
        provider_id: req.body.id,
        $nor: [{state: 0}],
    };

    let scrapData;
    scrapData = {
        from: 'users',
        let: {"invitees_id": "$invitees_id"},
        pipeline: [
            {$match: {$expr: {$eq: [{$toString: "$_id"}, "$$invitees_id"]}}},
            {$project: {"name": 1, "photo": 1}}
        ],
        as: 'clientInfo'
    };
    let sArray;
    await Appointments.aggregate([
        {$match: data},
        {
            $lookup: scrapData
        }]).then(async item => {
        if (item) {
            // Updating of the state value
            for (let k = 0; k < item.length; k++) {
                let clientArray = [];
                for (let i = 0; i < item[k].invitees_id.length; i ++) {
                    let clients = await Users.findOne({
                        _id: mongoose.Types.ObjectId(item[k].invitees_id[i]),
                    }, ["-password", "-practice_name", "-photo", "-loggedIn_state", "-phone", "-updated_date", "-main_provider_id", "-role", "-stripe_customer", "-stripe_account_id", "-provider_ids", "-client_ids", "-provider_drags", "-client_drags", "-stripe_customer_id" , "-bgPhoto", "-bigPhoto", "-address1", "-address2",
                        "-city", "-state_province", "-zip_code", "-country", "-about", "-cost", "-license_info", "-loggedIn_state", "-bgMusic", "-bgRoom", "-expertise",]);
                    clientArray.push(clients);
                }
                item[k].clientInfo = clientArray;
                let appointmentStartTime = Math.floor((new Date(item[k].start_time)).getTime() / (1000 * 60));
                let appointmentEndTime = Math.floor((new Date(item[k].end_time)).getTime() / (1000 * 60));
                let current = Math.floor((new Date()).getTime() / (1000 * 60));
                /**
                 * editable_state decision
                 */
                let editable_state;
                if(appointmentStartTime > current) {
                    if((item[k].state === 1 || item[k].state === 2 || item[k].state === 3 || item[k].state === 31) && (item[k].actual_start === undefined) && (item[k].paid_date === null || item[k].paid_date === undefined || item[k].payment === 0)) {
                        editable_state = 1;
                    } else {
                        editable_state = 0;
                    }
                } else {
                    editable_state = 0;
                }

                if(item[k].state === 1 || item[k].state === 2) {
                    await Appointments.updateOne({
                            _id: mongoose.Types.ObjectId(item[k]._id),
                        },
                        {
                            editable_state: editable_state,
                        });
                    continue;
                }

                if(item[k].state !== 4) {
                    if (appointmentStartTime > current) {
                        //if(appointmentStartTime - current <= 20) {
                        if(item[k].state !== 5) {
                            await Appointments.updateOne({
                                    _id: mongoose.Types.ObjectId(item[k]._id),
                                },
                                {
                                    state: 31, // Join for the appointment
                                    editable_state: editable_state,
                                });
                        }
                        //}
                    } else if (appointmentEndTime > current) {
                        if(item[k].state !== 5) {
                            await Appointments.updateOne({
                                    _id: mongoose.Types.ObjectId(item[k]._id),
                                },
                                {
                                    state: 32, // Start for the appointment
                                    editable_state: editable_state,
                                });
                        }
                    } else {
                        await Appointments.updateOne({
                                _id: mongoose.Types.ObjectId(item[k]._id),
                            },
                            {
                                state: 6, // the appointment already passed
                                editable_state: editable_state,
                            });
                    }
                } else {
                    if (appointmentEndTime > current && appointmentStartTime < current) {
                        await Appointments.updateOne({
                                _id: mongoose.Types.ObjectId(item[k]._id),
                            },
                            {
                                state: 4, // In progressing for the appointment
                                editable_state: editable_state,
                            });
                    } else if (appointmentEndTime < current){
                        await Appointments.updateOne({
                                _id: mongoose.Types.ObjectId(item[k]._id),
                            },
                            {
                                state: 5, // the appointment already finished
                                join_state: 0,
                                editable_state: editable_state,
                            });
                    }
                }
            }
            sArray = item;
        }
    }).catch(err => {
        console.log(err.toString());
        return res.status(400).json({msg: err.toString()});
    });

    /**
     * Filtering according to the date
     */
    let resultArray = [];
    for (let k = 0; k < req.body.dateArray.length; k ++) {
        let start = new Date(req.body.dateArray[k]).getTime();
        let end;
        if (k === req.body.dateArray.length - 1) {
            let y = new Date(req.body.dateArray[k]).getFullYear();
            let m = new Date(req.body.dateArray[k]).getMonth();
            let c = new Date(req.body.dateArray[k]).getDate();
            end = new Date(y, m, c + 1).getTime();
        } else {
            end = new Date(req.body.dateArray[k + 1]).getTime();
        }
        let partArray = [];
        for (let i = 0; i < sArray.length; i ++) {
            let item_startTime = new Date(sArray[i].start_time).getTime();
            if (item_startTime >= start && item_startTime < end) {
                partArray.push(sArray[i]);
            }
        }
        resultArray.push(JSON.parse(JSON.stringify(partArray)));
    }

    return res.status(200).json({msg: 'An appointments list has got successfully.', results: resultArray});
});
module.exports = router;
