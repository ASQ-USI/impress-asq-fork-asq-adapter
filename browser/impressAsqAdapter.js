/**
*  @fileoverview asqImpressAdapter.js
*  @description  This adapter adds support to ASQ for presentations using the ASQ fork of impress.js.
* It can work with or without an impress presenation in the page.
*
*  Released under the MIT and GPL Licenses.
*
* ------------------------------------------------
*  author:  Vasileios Triglianos
*  version: 0.0.1
*  source:  http://github.com/ASQ-USI/asq-impress-asq-fork-adapter/
*
* Based on code from  Bartek Szopka (@bartaz) http://github.com/bartaz/
*
* Impress doesn't allow a lot of control over it's internals. The way this script works
* is by overriding the 'goto', `next` and `prev` API functions with its own so that it 
* can transmit the events by sockets
* The keyboard and click event listeners in impress use the API version of the aforementioned 
* functions so they end up using the patched versions. 
*
* This implementation is based on a representation of steps as an Array of ids. It DOESN'T
* support DOM elements like impress.js to be more lightweight.
*
* We try to match variable nomenclature | function implementation as close to impress.js
* as possible.
*
*/


/**
* @param {Object} asqSocket an interface object to the real asq socket.
*/
'use strict';

var debug = require('bows')("asqImpressAdapter")
/**
* @constuctor
* @param {Object} asqSocket To send and receive events
* @param {Object} slidesTree a representation of the slide tree without DOM
* @param {boolean} standalone if present, the adapter will not patch impress
* @param {number} offset The number of 'next' events the presentation is ahead compared to the received events. Used in presenter control for the preview
*/
var asqImpressAdapter = module.exports = function(asqSocket, slidesTree, standalone, offset, initStep ){
  standalone = standalone || false;
  offset = offset || 0;
  // var names follow impress
  // similarly to impress.js we cache a patched impress API
  var roots=[];
  var impressPatched = false;  
  var root = document.getElementById('impress');
  var activeStep = null;
  var lastHash = "";
  var steps =null;
  var allSubsteps = null;

  if(slidesTree){
    steps = slidesTree.steps
    allSubsteps = slidesTree.allSubsteps;
  }else{
    allSubsteps = Object.create(null);

    //generate steps array
    var domsteps = slidesTree || document.querySelectorAll('.step');
    steps = [].slice.call(domsteps).map(function(el, idx){
      //this should be the same as impress.js
      if ( !el.id ) {
        el.id = "step-" + (idx + 1);
      }
      
      //generate substeps Object
      var elSubs = allSubsteps[el.id] = Object.create(null);
      elSubs.substeps = getSubSteps(el);
      elSubs.active = -1;

      return el.id;
    });
  }

  if(! standalone){
    // patch impress.js when it's ready
    patchImpress();
  }else{
    var firstStep = getStep(getElementFromHash()) || getStep(initStep) || steps[0];
    goto(firstStep, null, 0);
  }

  // react to goto events from sockets
  asqSocket.onGoto(onAsqSocketGoto);

  // `patchImpress` patches the impress.js api so that external scripts
  // that use goto, next and prev go through the adapter.
  function patchImpress(){
    if(impressPatched) return;
    
    if(typeof window.impress !== 'function'){
      document.addEventListener("impress:ready", patchImpress);
      return;
    }

    document.removeEventListener("impress:ready", patchImpress);

    debug("impress patched");
    var impressOrig = impress;

    window.impress = function(rootId){
      rootId = rootId || "impress";

      // if given root is already patched just return the API
      if (roots["impress-root-" + rootId]) {
        return roots["impress-root-" + rootId];
      }

      var api = impressOrig(rootId);
      api.prevOrig = api.prev;
      api.nextOrig = api.next;
      api.gotoOrig = api.goto;
      api.prev = prev;
      api.next = next;
      api.goto = goto;

      return  roots["impress-root-" + rootId] = api;
    }

    impressPatched = true;

    // START after patch had taken place
    // by selecting step defined in url or first step of the presentation
    goto(getElementFromHash() || steps[0], null, 0);
  }

  function onAsqSocketGoto(data){
    if("undefined" === typeof data || data === null){
      debug("data is undefined or null");
      return;
    }

    activeStep = data.step || activeStep;
    allSubsteps[activeStep].active = (!isNaN(data.substepIdx))
      ? data.substepIdx 
      : -1;

    var times = offset
    while (times-- >0 ){
      var nextState = getNext();
      activeStep = nextState.step || activeStep;
      allSubsteps[activeStep].active = (!isNaN(nextState.substepIdx))
        ? nextState.substepIdx 
        : -1;
    }

    if(typeof impress === 'function'){
      if(! impressPatched) { patchImpress() };
        var impressActiveStep = impress().gotoOrig(activeStep, allSubsteps[activeStep].active, data.duration);
    }

    var event = document.createEvent("CustomEvent");
    event.initCustomEvent("impress-adapter:onGoto", true, true, data);
    document.dispatchEvent(event);
  };


  function getSubSteps(el) {
    var steps = el.querySelectorAll(".substep"),
    order = [], unordered = [];
    Array.prototype.forEach.call(steps, function (el) {
      if (el.dataset) {
        var index = Number(el.dataset.order);
        
        if (!isNaN(index)) {
          if (!order[index]) {
              order[index] = el;
          } else if (Array.isArray(order[index])) {
              order[index].push(el);
          } else {
              order[index] = [order[index], el];
          }
        } else {
          unordered.push(el);
        } 
      } else {
         unordered.push(el);
      }
    });
    return order.filter(Boolean).concat(unordered);
  };

  // `getStep` is a helper function that returns a step element defined by parameter.
  // Contrary to the actual impress.js implementation this one returns and id
  // If a number is given, if of step with index given by the number is returned, 
  // if a string is given string is returned if it's a valid id
  //, if DOM element is given its id is returned
  function getStep( step ) {
    if (typeof step === "number") {
        step = step < 0 ? steps[ steps.length + step] : steps[ step ];
    } else if (typeof step === "string") {
        step = (steps.indexOf(step) > -1)? step: null
    }else if (Element && step instanceof Element && step.id) {
        step = step.id;
    }
    return step ? step : null;
  };

  // `goto` function that moves to step given with `el` parameter (ONLY id),
  // moves to substep given with subIdx (by index),
  // with a transition `duration` optionally given as second parameter.
  function goto ( id, subIdx, duration ) {
    
    //check if we have nothing
    if(id === null 
        || id === undefined 
        || 'string'!== typeof (id = getStep(id))){
      if((subIdx === null || subIdx === undefined || isNaN(subIdx))){
          return null;
      }
    }

    //this may be a resize
    if(activeStep == id && !subIdx){
      return impress().gotoOrig(activeStep)
    }

    //these two should be valid
    activeStep = id || activeStep;
    allSubsteps[activeStep].active = (!isNaN(subIdx))
      ? subIdx 
      : -1;

    debug("goto #"+ activeStep + ":" + allSubsteps[activeStep].active);
    asqSocket.emitGoto({step: activeStep, substepIdx: allSubsteps[activeStep].active, duration: duration})
    return activeStep;
  }

  function prev() {
    var subactive, substeps;
    
    substeps = allSubsteps[activeStep].substeps || [];

    //if we have substeps deal with them first
    if (substeps.length && ((subactive = allSubsteps[activeStep].active) || (subactive === 0))) {
      if (subactive >=0) {
        --subactive; 
        return goto(null, subactive)
      }
    }

    //no substeps or we are at the first substep. Go to the previous step
    var prev = steps.indexOf( activeStep ) - 1;
    prev = prev >= 0 ? steps[ prev ] : steps[ steps.length-1 ];

    var prevSubsteps = allSubsteps[prev].substeps || [];
    return goto(prev, (prevSubsteps.length -1));
  };

  function next () {
    var subactive, substeps;
    
    substeps = allSubsteps[activeStep].substeps || [];

    // if we have substeps deal with them first
    if (substeps.length && ((subactive = allSubsteps[activeStep].active) !== (substeps.length - 1))) {
      if(isNaN(subactive) || (subactive==null)){
          subactive = -1;
      }
      return goto(null, ++subactive);
    }

    // no substeps or substeps are over. Go to the next step
    var next = steps.indexOf( activeStep ) + 1;
    next = next < steps.length ? steps[ next ] : steps[ 0 ];

    return goto(next, -1);
  };

  function getNext(){
    var subactive, substeps;
    
    substeps = allSubsteps[activeStep].substeps || [];

    // if we have substeps deal with them first
    if (substeps.length && ((subactive = allSubsteps[activeStep].active) !== (substeps.length - 1))) {
      if(isNaN(subactive) || (subactive==null)){
          subactive = -1;
      }
      return { step: null, substepIdx: ++subactive};
    }

    // no substeps or substeps are over. Go to the next step
    var next = steps.indexOf( activeStep ) + 1;
    next = next < steps.length ? steps[ next ] : steps[ 0 ];

    return { step: next, substepIdx: -1};
  }

  // `getElementFromHash` returns an element located by id from hash part of
  // window location.
  function getElementFromHash() {
    // get id from url # by removing `#` or `#/` from the beginning,
    // so both "fallback" `#slide-id` and "enhanced" `#/slide-id` will work
    return window.location.hash.replace(/^#\/?/,"");
  };

  function onStepEnter(event) {
    window.location.hash = lastHash = "#/" + event.target.id;
  }

  function onHashChange() {
    // When the step is entered hash in the location is updated
    // (just few lines above from here), so the hash change is 
    // triggered and we would call `goto` again on the same element.
    //
    // To avoid this we store last entered hash and compare.
    if (window.location.hash !== lastHash) {
      goto( getElementFromHash() );
    }
  }

  function onKeyDown(){
    if(event.target == document.body){
       if ( event.keyCode === 9 || ( event.keyCode >= 32 && event.keyCode <= 34 ) || (event.keyCode >= 37 && event.keyCode <= 40) ) {
        event.preventDefault();
      }
    }
  }

  function onKeyUp(){
    if(event.target == document.body){
      if ( event.keyCode === 9 || ( event.keyCode >= 32 && event.keyCode <= 34 ) || (event.keyCode >= 37 && event.keyCode <= 40) ) {

        event.preventDefault();

        switch( event.keyCode ) {
          case 33: // pg up
          case 37: // left
          case 38: // up
          prev();
          break;
          case 9:  // tab
          case 32: // space
          case 34: // pg down
          case 39: // right
          case 40: // down
          next();
          break;
        }
      }
    }
  }

  function onClickLink ( event ) {
    // event delegation with "bubbling"
    // check if event target (or any of its parents is a link)
    var target = event.target;
    while ( (target.tagName !== "A") &&
      (target !== document.documentElement) ) {
      target = target.parentNode;
    } 

    if ( target.tagName === "A" ) {
      var href = target.getAttribute("href");

      // if it's a link to presentation step, target this step
      if ( href && href[0] === '#' ) {
        target = href.slice(1);
      }
    }

    if (typeof target == "string" && goto(target) ) {
      event.preventDefault();
    }
  }

  function onClickStep( event ) {
    var target = event.target;
      // find closest step element that is not active
      while ( !(target.classList.contains("step") && !target.classList.contains("active")) &&
        (target !== document.documentElement) ) {
        target = target.parentNode;
    }
    target = target.id;
    if ( goto(target) ) {
      event.preventDefault();
    }
  }

  function destroy(){
    if(root){
      root.removeEventListener("impress:stepenter", onStepEnter);
    }
    
    window.removeEventListener("hashchange", onHashChange);

    if(standalone){
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener("click", onClickLink);
      document.removeEventListener("click", onClickStep);
    }

    asqSocket.offGoto(onAsqSocketGoto);
  }

  if(root){
    root.addEventListener("impress:stepenter", onStepEnter, false);
  }
  
  window.addEventListener("hashchange", onHashChange, false);


  if(standalone){
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp, false);

    // delegated handler for clicking on the links to presentation steps
    // in contrast to impress.js this uses id only (for goto)
    document.addEventListener("click", onClickLink, false);

    // delegated handler for clicking on step elements
    // in contrast to impress.js this uses id only (for goto)
    document.addEventListener("click", onClickStep, false);
  }

  return {
    prev: prev,
    next: next,
    goto: goto,
    destroy: destroy
  }
}
