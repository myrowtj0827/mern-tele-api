const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Appointments = require("../models/appointment");

const global = require('../global');

router.all("/appointment/:id", async (req, res, next) => {
    let str = req.path.replace("/appointment/", '');
    const headers = {
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
    };
    res.writeHead(200, headers);

    /**
     * Push notification - SSE
     * @type {string}
     */
    const data = {
        'status': 'ok',
    };

    const sseFormattedResponse = `data: ${JSON.stringify(data)}\n\n`;
    res.write(sseFormattedResponse);
    res.flushHeaders();

    const clientId = Date.now();
    const newClient = {
        id: clientId,
        reqType: str,
        res
    };

    let reqType_array = [];
    for (let k = 0; k < usersForAppointmentStatus.length; k ++) {
        reqType_array.push(usersForAppointmentStatus[k].reqType);
    }

    if(reqType_array.indexOf(str) === -1) {
        console.log("=================================================")
        usersForAppointmentStatus.push(newClient);
     }

    console.log(usersForAppointmentStatus.length);
    req.on('close', () => {
        const idx = usersForAppointmentStatus.findIndex(x => x.id !== clientId);
        if (idx > -1) {
            usersForAppointmentStatus.splice(idx, 1);
        }
    });
});

module.exports = router;
