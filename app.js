const express = require("express");
const ws = require("ws");
const midtransClient = require("midtrans-client");
const fetch = require("node-fetch");

const CLIENT_KEY = "SB-Mid-client-pADhhMgmu_UW6k4T";
const SERVER_KEY = "SB-Mid-server-c5-HizfudlrsinKqhXDa2UrZ";

const app = express();

let dataWeb = [
	{
		to_client: "web",
		trigger_door: "off",
		battery_1: "empty",
		battery_2: "empty",
		battery_3: "empty",
		battery_4: "empty",
		qr_url: "",
	},
];

let dataDevice = [
	{
		to_client: "device",
		get_new_battery: 'false',
	}
]

let dataPay = {
	order_id: "bss-transaction-",
};

const wsServer = new ws.Server({ noServer: true });

let interval;
let payInterval;
let orderId = 1;

wsServer.on("connection", (socket) => {
	socket.on("message", (message) => {
		console.log(message.toString());
		let msg = "";
		try {
			msg = JSON.parse(message);
			if (msg.client == "web") {
				dataWeb[0].to_client = "device";
				dataWeb[0].trigger_door = msg.trigger_door;
				for (let c of wsServer.clients.values()) {
					c.send(JSON.stringify(dataWeb));
				}
				// console.log(dataWeb);
			} else if (msg.client == "device") {
				if (msg.trigger_door) {
					dataWeb[0].trigger_door = msg.trigger_door;
				} else if (msg.payment == "start") {
					let core = new midtransClient.CoreApi({
						isProduction: false,
						serverKey: SERVER_KEY,
						clientKey: CLIENT_KEY,
					});
					let parameter = {
						payment_type: "gopay",
						transaction_details: {
							gross_amount: 1000,
							order_id: dataPay.order_id + orderId,
						},
						gopay: {
							enable_callback: true,
							callback_url: "",
						},
					};
					core.charge(parameter).then((chargeResponse) => {
						let urlQr = chargeResponse.actions[0].url;
						console.log(urlQr);
						dataWeb[0].to_client = "web";
						dataWeb[0].qr_url = urlQr;
						for (let c of wsServer.clients.values()) {
							c.send(JSON.stringify(dataWeb));
						}
						payInterval = setInterval(async () => {
							const url =
								"https://api.sandbox.midtrans.com/v2/" +
								parameter.transaction_details.order_id +
								"%20/status";
							const options = {
								method: "GET",
								headers: {
									accept: "application/json",
									authorization:
										"Basic U0ItTWlkLXNlcnZlci1jNS1IaXpmdWRscnNpbktxaFhEYTJVclo6",
								},
							};
							fetch(url, options)
								.then((res) => res.json())
								.then((json) => {
									console.log("check payment status");
									if(json.transaction_status != "pending" && json.transaction_status != "failure"){
										dataDevice[0].get_new_battery = 'true'
										for (let c of wsServer.clients.values()) {
											c.send(JSON.stringify(dataDevice));
										}
									}
								})
								.catch((err) => console.error("error:" + err));
						}, 1000);
					});
				} else {
					dataWeb[0].battery_1 = msg.battery_1;
					dataWeb[0].battery_2 = msg.battery_2;
					dataWeb[0].battery_3 = msg.battery_3;
					dataWeb[0].battery_4 = msg.battery_4;
					dataWeb[0].to_client = "web";
					for (let c of wsServer.clients.values()) {
						c.send(JSON.stringify(dataWeb));
					}
				}
				if (msg.client_state == "ready") {
					interval = setInterval(() => {
						socket.ping();
					}, 3000);
				}
			}
		} catch (error) {
			console.log(error);
		}
	});
	socket.on("close", () => {
		console.log("closed");
		clearInterval(interval);
	});
});

const server = app.listen(3000);
server.on("upgrade", (request, socket, head) => {
	wsServer.handleUpgrade(request, socket, head, (socket) => {
		wsServer.emit("connection", socket, request);
	});
});
