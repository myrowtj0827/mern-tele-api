const express = require("express");
const cors = require('cors');
const app = express();
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const {MONGO_URL, FRONT_URL} = require("./config");
const passport = require("passport");

const users = require("./routes/user");
const appointments = require("./routes/appointment");
const documents = require("./routes/document");
const articles = require("./routes/articles");
const helpArticle = require("./routes/help-articles");
const payment = require("./routes/payment");
const message = require("./routes/messages");
const chatbot = require("./routes/chatbot");
const eventRouter = require("./routes/event");

app.use(
	cors({
		origin: '*',
	})
);

// Body-parser middleware
app.use(
	bodyParser.json({
		limit: '50mb',
	}));

app.use(express.static('public'));
// Connect to MongoDB
mongoose
	.connect(MONGO_URL, {useNewUrlParser: true, useUnifiedTopology: true})
	.then(() => console.log("MongoDB successfully connected"))
	.catch(err => console.log(err));

app.use(passport.initialize(null));
// app.use(express.static(path.join(__dirname, 'public')));
app.use("/public", express.static("public"));

app.use("/api/users", users);
app.use("/api/appointments", appointments);
app.use("/api/documents", documents);
app.use("/api/articles", articles);
app.use("/api/help-articles", helpArticle);
app.use("/api/payment", payment);
app.use("/api/message", message);
app.use("/api/chatbot", chatbot);

// Event Handler using SSE
app.use('/api/events', eventRouter);

const port = process.env.PORT || 7000;
app.listen(port, () => console.log(`Server up and running on port ${port}!`));
