var index = require("./index.js"),
    DomHandler = index.DomHandler,
	DomUtils = index.DomUtils;

//TODO: make this a streamable handler
function FeedHandler(callback, options){
	this.init(callback, options);
}

require("util").inherits(FeedHandler, DomHandler);

FeedHandler.prototype.init = DomHandler;

function getElements(what, where){
	return DomUtils.getElementsByTagName(what, where, true);
}
function getOneElement(what, where){
	return DomUtils.getElementsByTagName(what, where, true, 1)[0];
}
function getPosibleLink(where){
	// Fixed: Wrong getting link from blogger.com
	var doms = DomUtils.getElementsByTagName("link", where, true);
	for (var i = 0, max = doms.length; i < max; i++) {
		elem = doms[i];
		if (elem.attribs.rel == 'alternate') {
			return elem;
		}
		if(i == max - 1) {
			return doms[0];
		}
	}
}
function fetch(what, where, recurse){
	return DomUtils.getText(
		DomUtils.getElementsByTagName(what, where, recurse, 1)
	).trim();
}

function addConditionally(obj, prop, what, where, recurse){
	var tmp = fetch(what, where, recurse);
	if(tmp) obj[prop] = tmp;
}

function getLink(obj, prop, what, where, recurse){
	// Similar to getPosibleLink, but this is design for RSS
	var tmp = fetch(what, where, recurse);
	if (tmp.length == 0 || typeof tmp == 'undefined') {
		var tmp = DomUtils.getElementsByTagName("link", where, recurse, 1)[0];
		if (tmp !== 'undefined' && tmp['next']['data'] !== 'undefined') {
			tmp = removeCommentTags(tmp['next']['data']);
		}
	}
	if(tmp) obj[prop] = tmp;
}

/**
 * Custom function for get description
 * - Prevent some feed use <!--[CDATA[description]]--> (Example: http://techcrunch.com/feed/)
 * - Will find the posible descriotion of feed's item
 */
function getDescription (obj, prop, what, where, recurse) {
	var tmp;

	// Handle description tag
	var desc = DomUtils.getText(
		DomUtils.getElementsByTagName(what, where, recurse)
	).trim();

	if (!desc) {
		tmp = DomUtils.getElementsByTagName(what, where, recurse)[0];
		if (tmp) {
			desc = removeCommentTags(DomUtils.getInnerHTML(tmp));
		}
	}

	// Handler content tag
	var content = DomUtils.getText(
		DomUtils.getElementsByTagName('content', where, recurse)
	).trim();

	if (!content) {
		tmp = DomUtils.getElementsByTagName('content:encoded', where, recurse)[0];
		if (tmp) {
			content = removeCommentTags(DomUtils.getInnerHTML(tmp));
		}

	}

	// return the longest content
	if (desc.length > content.length) {
		obj[prop] = desc;
	} else {
		obj[prop] = content;
	}
}

/**
 * Custom function for get title
 * - Prevent some item title use <!--[CDATA[title]]--> (Example: http://techcrunch.com/feed/)
 */
function getTitle (obj, prop, what, where, recurse) {
	var tmp = DomUtils.getText(
		DomUtils.getElementsByTagName(what, where, recurse)
	).trim();
	if (tmp) {
		obj[prop] = tmp;
	} else {
		tmp = removeCommentTags(
			DomUtils.getInnerHTML(DomUtils.getElementsByTagName(what, where, recurse)[0])
		);
		if(tmp) obj[prop] = tmp;
	}
}

function removeCommentTags (content) {
	var startsWith = function (str, prefix) {
		return str.indexOf(prefix) === 0;
	};
	var endsWith = function (str, suffix) {
		return str.match(suffix + '$') == suffix;
	}
	var tmp = content;
	// Remove <!--[CDATA[ ]]-->
	if (startsWith(content, '<!--[CDATA[') && endsWith(content, ']]-->')) {
		tmp = tmp.replace(/^<!--\[CDATA\[/i, '').slice(0, -5);
	}
	// Remove <!CDATA[ ]]>
	if (startsWith(content, '<!CDATA[') && endsWith(content, ']]')) {
		tmp = tmp.replace(/^<!\[CDATA\[/i, '').slice(0, -2);
	}
	// Remove [CDATA[ ]]>
	if (startsWith(content, '[CDATA[') && endsWith(content, ']]')) {
		tmp = tmp.replace(/^\[CDATA\[/i, '').slice(0, -2);
	}
	return tmp;
}

var isValidFeed = function(value) {
	return value === "rss" || value === "feed" || value === "rdf:RDF";
};

FeedHandler.prototype.onend = function() {
	var feed = {},
		feedRoot = getOneElement(isValidFeed, this.dom),
		tmp, childs;

	if(feedRoot){
		if(feedRoot.name === "feed"){
			childs = feedRoot.children;

			feed.type = "atom";
			addConditionally(feed, "id", "id", childs);
			addConditionally(feed, "title", "title", childs);
			if((tmp = getOneElement("link", childs)) && (tmp = tmp.attribs) && (tmp = tmp.href)) feed.link = tmp;
			addConditionally(feed, "description", "subtitle", childs);
			if((tmp = fetch("updated", childs))) feed.updated = new Date(tmp);
			addConditionally(feed, "author", "email", childs, true);

			feed.items = getElements("entry", childs).map(function(item){
				var entry = {}, tmp;

				item = item.children;

				addConditionally(entry, "id", "id", item);
				addConditionally(entry, "title", "title", item);
				if((tmp = getPosibleLink(item)) && (tmp = tmp.attribs) && (tmp = tmp.href)) entry.link = tmp;
				addConditionally(entry, "description", "summary", item);
				addConditionally(entry, "description", "content", item);
				if((tmp = fetch("updated", item))) entry.pubDate = new Date(tmp);
				return entry;
			});
		} else {
			childs = getOneElement("channel", feedRoot.children).children;

			feed.type = feedRoot.name.substr(0, 3);
			feed.id = "";
			addConditionally(feed, "title", "title", childs);
			addConditionally(feed, "link", "link", childs);
			addConditionally(feed, "description", "description", childs);
			if((tmp = fetch("lastBuildDate", childs))) feed.updated = new Date(tmp);
			addConditionally(feed, "author", "managingEditor", childs, true);

			feed.items = getElements("item", feedRoot.children).map(function(item){
				var entry = {}, tmp;

				item = item.children;

				addConditionally(entry, "id", "guid", item);
				getTitle(entry, "title", "title", item);
				getLink(entry, "link", "link", item);
				getDescription(entry, "description", "description", item);
				// Handle pubDate
				if((tmp = fetch("pubDate", item))) {
					entry.pubDate = new Date(tmp);
				} else if ((tmp = fetch("pubdate", item))) {
					entry.pubDate = new Date(tmp);
				}
				return entry;
			});
		}
	}
	this.dom = feed;
	DomHandler.prototype._handleCallback.call(
		this, feedRoot ? null : Error("couldn't find root of feed")
	);
};

module.exports = FeedHandler;
