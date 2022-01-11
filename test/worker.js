/// <reference types="ses"/>

import '@agoric/install-ses/pre-remoting.js';
import '@agoric/install-ses/debug.js';

import { parentPort } from 'worker_threads';
import { makeGuest, makeHost } from './traplib.js';

const { details: X } = assert;

let dispatch;
parentPort.addListener('message', obj => {
  switch (obj.type) {
    case 'TEST_INIT': {
      assert(!dispatch, X`Internal error; duplicate initialization`);
      const { transferBuffer, isGuest } = obj;
      const initFn = isGuest ? makeGuest : makeHost;
      const ret = initFn(o => parentPort.postMessage(o), transferBuffer);
      dispatch = ret.dispatch;
      break;
    }
    default: {
      if (dispatch) {
        dispatch(obj);
      }
      break;
    }
  }
});
