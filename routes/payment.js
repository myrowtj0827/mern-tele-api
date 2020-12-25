const express = require("express");
const router = express.Router();
const config = require("../config");
const stripe = require('stripe')(config.STRIPE_SK);
const mongoose = require('mongoose');
const Users = require("../models/user");

router.all("/register-seller", async (req, res) => {
	const account = await stripe.accounts.create({
		type: 'express',
		email: req.body.email,
	});

	const accountLinks = await stripe.accountLinks.create({
		account: account.id,
		refresh_url: 'https://example.com/reauth',
		return_url: 'https://example.com/return',
		type: 'account_onboarding',
	});
});

router.all("/pay-to-seller", async (req, res) => {
	// 1. get connected account from seller's email
	const sItem = await Users.findOne({
		_id: mongoose.Types.ObjectId(req.body.id),
		role: {$elemMatch: {$eq: req.body.role}},
	});

	// 2. do pay to seller with the specific amount
	const paymentIntent = await stripe.paymentIntents.create({
		payment_method_types: ['card'],
		amount: 1000,
		currency: 'usd',
		application_fee_amount: 123,
		transfer_data: {
			destination: '{{CONNECTED_STRIPE_ACCOUNT_ID}}',
		},
	});
});

router.all("/get-plans", async (req, res) => {
	const plans = await stripe.plans.list({limit: 10});
	return res.status(200).json({plans: plans.data});
});

router.all("/current-subscription", async (req, res) => {
	const user = await Users.findOne({
		_id: mongoose.Types.ObjectId(req.body.user_id),
	});

	if(user && user.stripe_subscription_id){
		const subscription = await stripe.subscriptions.retrieve(
			user.stripe_subscription_id
		);

		return res.status(200).json({results: subscription});
	}

	return res.status(404).json({msg: 'No user or subscription yet.'});
});

router.all("/create-subscription", async (req, res) => {
	const STRIPE_PLANS_ID_TO_NAME = {
		price_1HbRxAIl7iWn5tibgRgsGc6E: 'month_individual_basic',
		price_1HbS8QIl7iWn5tibcYiOymEW: 'month_individual_plus',
		price_1HbS9kIl7iWn5tibC1jZxvnw: 'month_individual_ultimate',
		price_1HbSGSIl7iWn5tib4ODvtjfE: 'year_individual_basic',
		price_1HbSBtIl7iWn5tib7XZj91hU: 'year_individual_plus',
		price_1HbSAIIl7iWn5tibmgqq1hIa: 'year_individual_ultimate',
	};

	const user = await Users.findOne({
		_id: mongoose.Types.ObjectId(req.body.user_id),
	});

	if(user && user.stripe_customer_id){
	}
	else{
		return res.status(400).json({msg: 'Before creating subscription, please update your billing info.'});
	}

	if(user && user.stripe_subscription_id){
		const subscription = await stripe.subscriptions.retrieve(
			user.stripe_subscription_id
		);

		console.log("old subscription:", subscription.plan.id);
		if(subscription.plan.id === req.body.plan_id){
			return res.status(400).json({msg: 'A subscription with same pricing plan already existed.'});
		}

		// delete existing subscription
		const deleted = await stripe.subscriptions.del(
			subscription.id
		);
	}

	// updating of the provider's plan
	await Users.collection.updateOne(
		{ _id: mongoose.Types.ObjectId(req.body.user_id) },
		{
			$set: {
				plan_string: STRIPE_PLANS_ID_TO_NAME[req.body.plan_id],
				updated_date:  new Date().toLocaleDateString([], {
					year: 'numeric',
					month: 'long',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit',
				}),
			}
		}).then(() => {
	}).catch(err => {
		console.log(err.toString());
	});

	// create a subscription
	const subscription = await stripe.subscriptions.create({
		customer: user.stripe_customer_id,
		items: [
			{price: req.body.plan_id},
		],
	});

	user.stripe_subscription_id = subscription.id;
	user.save().then(item => {
	}).catch(err => {
		return res.status(500).json({msg: err.toString()});
	});

	//console.log("new subscription:", subscription);
	return res.status(200).json({results: subscription});
});

module.exports = router;
