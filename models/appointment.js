const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * Appointment schema
 */
const AppointmentSchema = new Schema({
    all_day: {
        type: Boolean,
        required: false,
    },

    recurring: {
        type: Boolean,
        required: false,
    },

    online: {
        type: Boolean,
        required: false,
    },

    title: {
        type: String,
        required: true,
    },

    notes: {
        type: String,
        required: false,
    },

    time_distance: {
        type: String,
        required: false,
    },

    start_time: {
        type: Date,
        required: true,
    },

    end_time: {
        type: Date,
        required: false,
    },

    provider_id: {
        type: String,
        required: true,
    },

    repeat_until: {
        type: Date,
        required: false,
    },

    invitees_id: {
        type: Array,
        required: true,
    },

    recurrence_frequency: {
        type: String,
        required: false,
    },

    payment: {
        type: Number,
        required: false,
    },

    week_number: {
        type: Number,
        required: true,
    },
    /**
     * state = 0: invite via email or phone
     * state = 1: Created
     * state = 2: Accepted
     * state = 3: Paid
     * state = 4: Processing
     * state = 5: Finishing
     * state = 6: Passed the time
     * editable_state = 1: Editable state
     */
    state: {
        type: Number,
        required: true,
    },
    editable_state: {
        type: Number,
        required: false,
    },
    paid_date: {
        type: Date,
        required: false,
    },
    requested_date: {
        type: Date,
        required: true,
    },
    deleted_date: {
        type: Date,
        required: false,
    },
    updated_date: {
        type: Date,
        required: false,
    },
    role_updated: {
        type: String,
        required: false,
    },

    /**
     * date had the meeting
     */
    // session_date: {
    //     type: Date,
    //     required: false,
    // },
    //
    // actual_start: {
    //     type: Date,
    //     required: false,
    // },
    //
    // actual_time: {
    //     type: Date,
    //     required: false,
    // },

    /**
     * meeting date
     */
    // session_finish_date: {
    //     type: Date,
    //     required: false,
    // },
    actual_start: {
        type: Date,
        required: false,
    },
    actual_end: {
        type: Date,
        required: false,
    },

    join_state: {
        type: Number,
        required: false,
    },
    join_client_ids: {
        type: Array,
        required: false,
    },

    allow: {
        type: Boolean,
        required: false,
    },
    /**
     * invite via email or phone
     */
    invite_email: {
        type: String,
        required: false,
    },
    invite_phone: {
        type: Number,
        required: false,
    },

    /**
     * the requested appointment via client
     */
    invite_client: {
        type: Boolean,
        required: false,
    },
    /**
     * Reminder check
     */
    last_reminder_date: {
        type: Date,
        required: false,
    },
    reminder_check: {
        type: Boolean,
        required: false,
    },
    appointment_type: {
        type: String,
        required: false,
    },
});

module.exports = Appointments = mongoose.model("appointments", AppointmentSchema);
