/*
 * Copyright 2013 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Code for detecting and sending to server the critical images
 * (images above the fold) on the client side.
 *
 * @author jud@google.com (Jud Porter)
 */

// Exporting functions using quoted attributes to prevent js compiler from
// renaming them.
// See http://code.google.com/closure/compiler/docs/api-tutorial3.html#dangers
window['pagespeed'] = window['pagespeed'] || {};
var pagespeed = window['pagespeed'];

/**
 * @constructor
 * @param {string} beaconUrl The URL on the server to send the beacon to.
 * @param {string} htmlUrl Url of the page the beacon is being inserted on.
 */
pagespeed.CriticalImagesBeacon = function(beaconUrl, htmlUrl) {
  this.beaconUrl_ = beaconUrl;
  this.htmlUrl_ = htmlUrl;
  this.windowSize_ = this.getWindowSize_();
  this.imgLocations_ = {};
};

/**
 * Returns the size of the window.
 * @return {{
 *     height: (number),
 *     width: (number)
 * }}
 * @private
 */
pagespeed.CriticalImagesBeacon.prototype.getWindowSize_ = function() {
  var height = window.innerHeight || document.documentElement.clientHeight ||
      document.body.clientHeight;
  var width = window.innerWidth || document.documentElement.clientWidth ||
      document.body.clientWidth;
  return {
    height: height,
    width: width
  };
};

/**
 * Returns the absolute position of the top left corner of the element.
 * @param {Element} element DOM element to calculate the location of.
 * @return {{
 *      top: (number),
 *      left: (number)
 * }}
 * @private
 */
pagespeed.CriticalImagesBeacon.prototype.elLocation_ = function(element) {
  var rect = element.getBoundingClientRect();

  // getBoundingClientRect() is w.r.t. the viewport. Add the amount scolled to
  // calculate the absolute position of the element.
  var scroll_x, scroll_y;
  // From https://developer.mozilla.org/en-US/docs/DOM/window.scrollX
  scroll_x = (window.pageXOffset !== undefined) ? window.pageXOffset :
      (document.documentElement ||
       document.body.parentNode ||
       document.body).scrollLeft;
  scroll_y = (window.pageYOffset !== undefined) ? window.pageYOffset :
      (document.documentElement ||
       document.body.parentNode ||
       document.body).scrollTop;

  return {
    top: rect.top + scroll_y,
    left: rect.left + scroll_x
  };
};

/**
 * Returns true if an element is visible upon initial page load.
 * @param {Element} element The DOM element to check for visibility.
 * @return {boolean} True if the element is critical.
 * @private
 */
pagespeed.CriticalImagesBeacon.prototype.isCritical_ = function(element) {
  // TODO(jud): We can perform a more efficient critical image check if lazyload
  // images is enabled, and this beacon code runs after the lazyload JS has
  // initially executed. Specifically, we know an image is not critical if it
  // still has the 'pagespeed_lazy_src' attribute, meaning that the image was
  // not visible in the viewport yet. This will save us potentially many calls
  // to the expensive getBoundingClientRect().

  // Make sure the element is visible first before checking its position on the
  // page. Note, this check works correctly with the lazyload placeholder image,
  // since that image is a 1x1 pixel, and styling it display=none also sets
  // offsetWidth and offsetHeight to 0.
  if (element.offsetWidth <= 0 && element.offsetHeight <= 0) {
    return false;
  }

  var elLocation = this.elLocation_(element);
  // Only return 1 image as critical if there are multiple images that have the
  // same location. This is to handle sliders with many images in the same
  // location, but most of which only appear after onload.
  var elLocationStr = JSON.stringify(elLocation);
  if (this.imgLocations_.hasOwnProperty(elLocationStr)) {
    return false;
  } else {
    this.imgLocations_[elLocationStr] = true;
  }

  return (elLocation.top <= this.windowSize_.height &&
          elLocation.left <= this.windowSize_.width);
};

/**
 * Check position of images and input tags and beacon back images that are
 * visible on initial page load.
 * @private
 */
pagespeed.CriticalImagesBeacon.prototype.checkCriticalImages_ = function() {
  // List of tags whose elements we will check to see if they are critical.
  var tags = ['img', 'input'];
  // Use an object to store the critical_imgs so that we get a unique (no
  // duplicates) list of them.
  var critical_imgs = {};

  for (var i = 0; i < tags.length; ++i) {
    var elements = document.getElementsByTagName(tags[i]);
    for (var j = 0; j < elements.length; ++j) {
      // TODO(jud): Remove the check for getBoundingClientRect below, either by
      // making elLocation_ work correctly if it isn't defined, or updating the
      // user agent whitelist to exclude UAs that don't support it correctly.
      if (elements[j].hasAttribute('pagespeed_url_hash') &&
          elements[j].getBoundingClientRect &&
          this.isCritical_(elements[j])) {
        critical_imgs[elements[j].getAttribute('pagespeed_url_hash')] = true;
      }
    }
  }
  critical_imgs = Object.keys(critical_imgs);
  if (critical_imgs.length != 0) {
    var url = this.beaconUrl_;
    // Handle a beacon url that already has query params.
    url += (url.indexOf('?') == -1) ? '?' : '&';
    url += 'url=' + encodeURIComponent(this.htmlUrl_);
    url += '&ci=' + encodeURIComponent(critical_imgs[0]);
    var MAX_URL_LEN = 2000;
    for (var i = 1; i < critical_imgs.length &&
         url.length < MAX_URL_LEN; ++i) {
      url += ',' + encodeURIComponent(critical_imgs[i]);
    }
    // Export the URL for testing purposes.
    pagespeed['criticalImagesBeaconUrl'] = url;
    // TODO(jud): This beacon should coordinate with the add_instrumentation JS
    // so that only one beacon request is sent if both filters are enabled.
    new Image().src = url;
  }
};

/**
 * Runs the function when event is triggered.
 * @param {Window|Element} elem Element to attach handler.
 * @param {string} ev Name of the event.
 * @param {function()} func New onload handler.
 *
 * TODO(nikhilmadan): Avoid duplication with the DeferJs code.
 */
pagespeed.addHandler = function(elem, ev, func) {
  if (elem.addEventListener) {
    elem.addEventListener(ev, func, false);
  } else if (elem.attachEvent) {
    elem.attachEvent('on' + ev, func);
  } else {
    var oldHandler = elem['on' + ev];
    elem['on' + ev] = function() {
      func.call(this);
      if (oldHandler) {
        oldHandler.call(this);
      }
    };
  }
};

/**
 * Initialize.
 * @param {string} beaconUrl The URL on the server to send the beacon to.
 * @param {string} htmlUrl Url of the page the beacon is being inserted on.
 */
pagespeed.criticalImagesBeaconInit = function(beaconUrl, htmlUrl) {
  var temp = new pagespeed.CriticalImagesBeacon(beaconUrl, htmlUrl);
  // Add event to the onload handler to scan images and beacon back the visible
  // ones.
  var beacon_onload = function() {
    // Attempt not to block other onload events on the page by wrapping in
    // setTimeout().
    // TODO(jud): checkCriticalImages_ should not run until after lazyload
    // images completes. This will allow us to reduce the complexity of managing
    // the interaction between the beacon and the lazyload jS, and to do a more
    // efficient check for image visibility.
    window.setTimeout(function() {
      temp.checkCriticalImages_();
    }, 0);
  };
  pagespeed.addHandler(window, 'load', beacon_onload);
};

pagespeed['criticalImagesBeaconInit'] = pagespeed.criticalImagesBeaconInit;
