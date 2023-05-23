let px_per_rem = Math.ceil(window.innerHeight / 60);
document.querySelector("#rem_style").innerHTML = 'html{font-size:'+px_per_rem+'px;}';

let width = window.innerHeight * 1.15;
if (width > 1200) width = 1200;
let height = width;

let map_url = "https://davidmathu.github.io/wc/map.jpg";
//map_url = "https://i.imgur.com/HG33v0U.jpg";
//map_url = "https://i.imgur.com/kQI6XHc.png";

let rx = 0; let ry = 0; //the rotations
let min_ry = 0.2; let max_ry = Math.PI-0.2;
let vx = 0; let vy = 0; //the velocities
let mouse_down = null;
let cam_coords = [];
let cam_distance = 400;
let zoom_factor = 0.9;

let points = [];

let closest_point_index;
let closest_point_distance;
let open_index = -1;

let frame_count = 0;
let globe_active = true;
let longitude_breakpoint = -0.7;

function preload() {
	rhTex = loadImage(map_url);
}

function setup() {
	//establish canvas
	createCanvas(width, height, WEBGL);
	let canvas = document.querySelector("canvas");
	let canvas_container = document.querySelector("#canvas_container");
	canvas_container.appendChild(canvas);
	canvas_container.onmousedown = function(){
		mouse_down = [mouseX, mouseY];
		canvas_container.style.cursor = "grabbing";
	};
	document.onmouseup = function(){
		mouse_down = null;
		canvas_container.style.cursor = "grab";
	};
	//3d objects
  cam = createCamera();
	//get points
	let sections = document.getElementsByTagName("section");
	//establish all point objects
	for (let i = 0; i < sections.length; i++) {
		//get our element
		let element = sections[i];
		let rgb = hex_to_rgb(element.getAttribute("color"));
		//get the full article
		let full_article = element.querySelector("article");
		full_article.remove();
		points.push({
			latitude: -JSON.parse(element.getAttribute("latitude"))/180*Math.PI-Math.PI/2,
			longitude: -JSON.parse(element.getAttribute("longitude"))/180*Math.PI,
			element: element,
			r: rgb[0],
			g: rgb[1],
			b: rgb[2],
			color_hex: element.getAttribute("color"),
			full_article: full_article,
			name: element.getAttribute("name"),
			origin: element.getAttribute("origin"),
			iframe_url: element.getAttribute("iframe")
		});
		element.style.setProperty("--color", "#"+points[i].color_hex);
		full_article.style.setProperty("--color", "#"+points[i].color_hex);
		//insert html for automated h1, h2, button, crosslink
		element.insertAdjacentHTML("afterbegin", '<h1>'+points[i].name+'</h1><div class="img"><img class="flag"><h2>'+points[i].origin+'</h2></div>');
		element.insertAdjacentHTML("beforeend", '<button onclick="open_article('+i+');">Play</button>');
		element.querySelector(".img").style.backgroundImage = "url('"+element.getAttribute("image")+"')";
		element.querySelector(".flag").setAttribute("src",element.getAttribute("flag"));
		if (element.hasAttribute("cpuopponent")) element.insertAdjacentHTML("beforeend", '<h4>Includes CPU opponent</h4>');
		full_article.insertAdjacentHTML("afterbegin", '<h1>'+points[i].name+'</h1><h2>'+points[i].origin+'</h2>');
		full_article.insertAdjacentHTML("beforeend", '<button onclick="close_article();">Close</button>');
		full_article.insertAdjacentHTML("beforeend", '<button onclick="close_article();">Close</button><iframe></iframe>');
		if (element.hasAttribute("cpuopponent")) full_article.insertAdjacentHTML("beforeend", '<h4>Includes CPU opponent</h4>');
		
		while (points[i].longitude < 0) points[i].longitude += Math.PI*2;
		let point_cartesian_coords = spherical_to_cartesian(points[i].longitude, points[i].latitude);
		points[i].x = point_cartesian_coords[0] * 100;
		points[i].z = point_cartesian_coords[1] * 100;
		points[i].y = point_cartesian_coords[2] * 100;
	}
	//establish crosslinks. now that all sections exist
	for (p of points) for (el of p.full_article.querySelectorAll("a")) if (el.hasAttribute("place")) {
		let the_place = el.getAttribute("place").toLowerCase();
		for (let j = 0; j < points.length; j++) if (points[j].name.toLowerCase() == the_place || points[j].origin.toLowerCase() == the_place) {
			el.setAttribute("onclick", "go_to_point("+j+")");
			el.style.setProperty("--color", "#"+points[j].color_hex);
		}
	}
	frameRate(60);
	go_to_point(0);
	//rx = 0-(Math.random()*1000%(2*Math.PI)); vx = -1; ry = Math.PI/2;
	setTimeout(function(){
		document.querySelector("#loading").remove();
		open_index = -1;
	}, 10);
}

function mouseWheel(event) {
	if (!globe_active) return;
	zoom_factor += event.delta * 0.0005;
	if (zoom_factor < 0.7) zoom_factor = 0.7;
	if (zoom_factor > 1.1) zoom_factor = 1.1;
}

function draw() {
	frame_count++;
	noStroke();
	background(0, 0, 15);
	update_mouse_physics();
	update_camera_position();
	closest_point_distance = 999999999;
	for (let i = 0; i < points.length; i++) draw_point(i);
	draw_earth();
	if (closest_point_index != open_index) {
		if (open_index+1) points[open_index].element.style.setProperty("display", "none");
		open_index = closest_point_index;
		points[open_index].element.style.setProperty("display", "block");
		let globe_emoji = "";
		if (points[open_index].longitude < 1.5) {
			globe_emoji = "🌎";
		} else if (points[open_index].longitude < 3.5) {
			globe_emoji = "🌏";
		} else if (points[open_index].longitude < 5) {
			globe_emoji = "🌍"
		} else globe_emoji = "🌎";
		document.querySelector("title").innerText = globe_emoji + " " + points[open_index].name;
	}
}

function update_mouse_physics() {
	vx *= 0.85; vy *= 0.85;
	rx += vx; ry += vy;
	if (rx < 0) rx += Math.PI*2;
	if (rx > Math.PI*2) rx -= Math.PI*2;
	if (ry < min_ry) {ry = min_ry; vy = 0;}
	if (ry > max_ry) {ry = max_ry; vy = 0;}
	if (mouse_down) {
		//set vx vy to offsets from old mouse down, and update mouse down
		vx += (mouseX - mouse_down[0])*0.0007;
		vy += (mouseY - mouse_down[1])*0.0004;
		mouse_down = [mouseX, mouseY];
	}
	if (open_index+1) {
		let offer1 = rx - points[open_index].longitude;
		let offer2 = rx - points[open_index].longitude - Math.PI * 2;
		let offer3 = rx - points[open_index].longitude + Math.PI * 2;
		let offer = (Math.abs(offer1)<Math.abs(offer2)&&Math.abs(offer1)<Math.abs(offer3)) ? offer1 : (Math.abs(offer2)<Math.abs(offer3) ? offer2 : offer3);
		vx -= offer*0.0003;
	}
	if (open_index+1) vy -= (ry + points[open_index].latitude)*0.0004;
}

function spherical_to_cartesian(a, b) {
	let x = Math.cos(a);
	let y = Math.sin(a);
	let z = Math.cos(b);
	x *= (1-z*z);
	y *= (1-z*z);
	let dist = Math.sqrt(x*x + y*y + z*z);
	x /= dist;
	y /= dist;
	z /= dist;
	return [x, z, y];
}

function update_camera_position() {
	let mouse_distance_from_center = Math.hypot(mouseX-width/2, mouseY-height/2);
	let ideal_cam_distance = (300 + 0.01 * mouse_distance_from_center) * zoom_factor;
	cam_distance = cam_distance*0.95 + ideal_cam_distance*0.05;
	let x, y, z;
	[x, z, y] = spherical_to_cartesian(rx, ry);
	[x, z, y] = [cam_distance*x, cam_distance*z, cam_distance*y];
	cam_coords = [x, z, y];
	cam.setPosition(x, z, y);
	pointLight(180, 180, 190, 150*x, 150*z, 150*y);
	//if (open_index+1) pointLight(255, 255, 255, points[open_index].x*1.5, points[open_index].y*1.5, points[open_index].z*1.5);
	pointLight(255, 255, 255, 150*x, 150*z, 150*y);
	cam.lookAt(0, 0, 0);
}

function draw_earth() {
	texture(rhTex);
	sphere(100, 20, 20);
	push();
	translate(-cam_coords[0], -cam_coords[1], -cam_coords[2]);
	fill(color(50, 107, 251));
	sphere(203, 20, 20);
	pop();
}

function draw_point(i) {
	let point = points[i];
	let distance = square_distance([point.x, point.z, point.y], cam_coords);
	if (distance < closest_point_distance) {
		closest_point_index = i;
		closest_point_distance = distance;
	}
	push();
	translate(point.x, point.z, point.y);
	fill(color(point.r, point.g, point.b));
	if (i == open_index) {
		sphere(4+Math.sin(frame_count*0.1), 20, 20);
	} else {
		sphere(2, 10, 10);
	}
	pop();
}

function square_distance(v1, v2) {
	let sum = 0;
	for (let i = 0; i < Math.min(v1.length, v2.length); i++)
		sum += (v1[i] - v2[i]) * (v1[i] - v2[i]);
	return sum;
}

function hex_to_rgb(e){e=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(e);return e?[parseInt(e[1],16),parseInt(e[2],16),parseInt(e[3],16)]:null}

function open_article(i) {
	document.querySelector("#article_view").appendChild(points[i].full_article);
	document.querySelector("#article_view iframe").setAttribute("src", points[i].iframe_url);
	console.log(points[i])
	setTimeout(function() {
		globe_active = false;
		noLoop();
	}, 1000);
}

function close_article() {
	document.querySelector("#article_view").style.animation = "1s article_view_exit";
	globe_active = true;
	loop();
	setTimeout(function(){
		document.querySelector("#article_view iframe").removeAttribute("src");
		document.querySelector("#article_view article").remove();
		document.querySelector("#article_view").style.animation = "1s article_view_enter";
	}, 990);
	//open_index = -1;
}

window.addEventListener('keydown', function (e) {
	if (e.key == "Escape") {
		if (!globe_active) document.querySelector("#article_view button").click();
	}
}, false);

function go_to_point(i) {
	let p = points[i];
	if (!globe_active) close_article();
	vx = 0;
	vy = 0;
	rx = p.longitude;
	ry = -p.latitude;
	cam_distance = 400;
}