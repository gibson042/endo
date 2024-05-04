// This is a demo weblet that demonstrates a permission management UI for the
// pet daemon itself.
//
// This command will set up the cat page, create a URL,
// and open it.
//
// > endo install cat.js --powers AGENT --listen 8920 --name cat
//
// Thereafter,
//
// > endo open cat
//
// To interact with the permission manager, you can mock requests from a fake
// guest.
//
// > endo eval 42 --name ft
// > endo mkguest feline
// > endo request --as feline 'pet me'
//
// At this point, the command will pause, waiting for a response.
// In the Familiar Chat window, resolve the request with the pet name "ft" and
// the request will exit with the number 42.

/* global window document requestAnimationFrame */
/* eslint-disable no-continue */

import { E } from '@endo/far';
import { passStyleOf } from '@endo/pass-style';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import { parseMessage } from '../src/message-parse.js';

const template = `
<style>

  :root {
    --tint-color:   hsl(210, 71%, 72%);
    --border-color: hsl(210, 60%, 52%);
    --mask-color:   hsla(210, 38%, 29%, 0.5);
  }

  * {
    box-sizing: border-box;
    font-family: Bahnschrift, 'DIN Alternate', 'Franklin Gothic Medium', 'Nimbus Sans Narrow', sans-serif-condensed, sans-serif;
    font-weight: normal;
  }

  body {
    height: 100vh;
    overflow: hidden;
    margin: 0;
    padding: 0;
    font-size: 200%;
  }

  #messages {
    height: calc(100vh + 1px);
    width: 70vw;
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    right: 70vw;
    padding-top: 100vh;
    padding-left: 20px;
    padding-right: 20px;
    padding-bottom: 20px;
    margin: 0px;
    overflow-y: auto;
    overflow-x: hidden;
  }

  #anchor {
    height: 20px;
  }

  #pets {
    height: 100vh;
    width: 30vw;
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 70vw;
    padding: 20px;
    overflow-y: auto;
    overflow-x: hidden;
    background-color: var(--tint-color);
    border-left: 1px solid var(--border-color);
  }

  #pet-list {
    display: flex;
    flex-direction: column;
    flex-wrap: wrap-reverse;
  }

  #pet-item {
    whitespace: no-wrap;
  }

  #controls {
    position: absolute;
    right: 0;
    bottom: 0;
    padding: 20px;
    display: flex;
    flex-direction: row-reverse;
    flex-wrap: wrap-reverse;
  }

  #controls > button {
    font-size: 50px;
    border-width: 5px;
    border-radius: 10px;
    margin: 5px;
  }

  #controls button:not([id=cat]) {
    display: none;
  }

  #controls[data-show=true] button {
    display: inline;
  }

  textarea {
    max-width: 100%;
  }

  input {
    max-width: 100%;
  }

  input.big {
    font-size: 125%;
  }
  input.half-wide {
    max-width: 10ex;
  }

  #chat-message {
    max-width: 40ex;
  }

  #eval-source {
    width: 40ex;
    font-size: 150%;
  }

  #eval-result-name {
    font-size: 150%;
  }

  .frame {
    display: none;
    position: absolute;
    height: 100vh;
    width: 100vw;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    align-items: center;
    justify-content: center;
    background-color: var(--mask-color);
  }

  .frame[data-show=true] {
    display: flex;
  }

  .window {
    background-color: white;
    margin: 20px;
    padding: 20px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    overflow: auto;
    max-height: calc(100vh - 40px);
    max-width: calc(100vw - 40px);
    align-self: center;
    flex: none;
  }

  #value-value {
    padding: 5px;
  }

  .string {
    white-space: pre;
    font-family: monospace;
    background-color: lightgray;
    word-break: break-word;
  }

  .number {
    color: blue;
    font-family: monospace;
  }

  .bigint {
    color: darkgreen;
    font-family: monospace;
  }

  .array {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    min-width: 1ex;
    min-height: 1em;

    position: relative;
    border-width: 10px 20px;
    border-style: solid;
    border-image-source: var(--brackets-url);
    border-image-slice: 20 60 20 60;
    border-image-repeat: stretch;
  }

  .array > *{
    margin: 5px;
  }

  .object {
    display: flex;
    align-items: center;
    border: solid black 3px;
    border-radius: 10px;
    min-width: 1ex;
    min-height: 1em;

    position: relative;
    display: flex;
    border-style: solid;
    border-color: transparent;
    border-width: 10px 20px;
    justify-content: center;
    align-items: center;
  }

  .object::before {
    content: '';
    position: absolute;
    top: -10px;
    bottom: 50%;
    left: -20px;
    right: -20px;
    border-width: 10px 20px 10px 20px;
    border-style: solid;
    border-color: red;
    border-image-source: var(--braces-url);
    border-image-slice: 40 60 40 60;
  }

  .object::after {
    content: '';
    position: absolute;
    top: 50%;
    bottom: -10px;
    left: -20px;
    right: -20px;
    border-width: 10px 20px 10px 20px;
    border-style: solid;
    border-color: red;
    border-image-source: var(--braces-url);
    border-image-slice: 40 60 40 60;
    transform: rotate(180deg);
    pointer-events: none;
  }

  .entry {
    border: solid 1px var(--border-color);
    border-radius: 5px;
    padding: 5px;
    margin: 5px;
    display: flex;
    flex-direction: row;
    align-items: center;
  }

  .remotable {
    background-color: var(--tint-color);
  }

  .key {
    background-color: white;
    white-space: nowrap;
    font-family: monospace;
  }

  .error {
    color: red;
    font-family: monospace;
    word-break: break-word;
    max-width: 40ex;
  }

  .adoption {
    white-space: nowrap;
  }

</style>

<div id="messages">
  <div id="anchor"></div>
</div>

<div id="pets">
</div>

<div id="controls">
  <button id="cat">🐈‍⬛</button>
  <button id="chat-button">Chat</button>
  <button id="eval-button">Eval</button>
</div>

<div id="chat-frame" class="frame">
  <div id="chat-window" class="window">
    <label for="chat-to">To:&nbsp;<select id="chat-to"></select></label>
    <p><input type="text" id="chat-message">
    <p id="chat-error" class="error">
    <p><button id="chat-discard-button">Discard</button>
    <button id="chat-send-button">Send</button>
  </div>
</div>

<div id="eval-frame" class="frame">
  <div id="eval-window" class="window">
    <label for="eval-source"><p>
      Source:<br>
      <textarea id="eval-source" rows="1"></textarea>
    </p></label>
    <span id="eval-endowments"></span>
    <p><button id="eval-add-endowment">Add Endowment</button>
    <label for="eval-result-name">
      <p>Result name (optional):<br>
      <input type="text" id="eval-result-name">
    </p></label>
    <span id="eval-error"></span>
    <p>
    <button id="eval-discard-button">Discard</button>
    <button id="eval-submit-button">Evaluate</button>
  </div>
</div>

<div id="value-frame" class="frame">
  <div id="value-window" class="window">
    <div id="value-value"></div>
    <button id="value-close">Close</button>
  </div>
</div>
`;

// Introduce background images for curly braces and square brackets to the
// style sheet.

const root = document.querySelector(':root');

const bracketsBlob = new Blob(
  [
    `<?xml version="1.0" encoding="UTF-8"?>
    <svg version="1.1" height="120" width="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <path d="m17.982 4.125v44 23.75 44h35.852v-3.1367h-18.895v-40.863-23.75-40.863h18.895v-3.1367h-35.852z" color="#000000" stop-color="#000000" style="-inkscape-stroke:none"/>
      <path d="m66.166 4.125v3.1367h18.895v40.863 23.75 40.863h-18.895v3.1367h35.852v-44-23.75-44h-35.852z" color="#000000" stop-color="#000000" style="-inkscape-stroke:none"/>
    </svg>
  `,
  ],
  { type: 'image/svg+xml' },
);
const bracketsUrl = URL.createObjectURL(bracketsBlob);
root.style.setProperty('--brackets-url', `url(${bracketsUrl})`);

const bracesBlob = new Blob(
  [
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
    <svg width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <path
         style="color:#000000;overflow:visible;fill:#000000;stroke-width:154.309;stroke-linecap:round;stroke-linejoin:round;-inkscape-stroke:none;stop-color:#000000"
         d="m 53.833038,4.1252291 c -9.180825,0 -16.085381,1.0054216 -20.713729,3.0162626 C 26.442303,10.073969 22.041565,15.645687 19.917096,23.856614 18.627251,28.799927 17.9823,34.916252 17.9823,42.205543 v 47.631819 c 0,8.210936 -1.062236,14.704298 -3.186764,19.480038 C 11.98818,115.68506 7.0563546,118.86891 0,118.86891 V 120 h 16.969363 c 6.980194,-2.56221 11.851299,-6.65631 14.556563,-12.31641 2.27621,-4.85954 3.414372,-12.232635 3.414372,-22.119257 V 38.058184 c 0,-10.975832 1.517457,-18.851647 4.55248,-23.627393 3.034965,-4.7757408 7.815052,-7.1636238 14.34026,-7.1636238 z" />
      <path
         style="color:#000000;overflow:visible;fill:#000000;stroke-width:154.309;stroke-linecap:round;stroke-linejoin:round;-inkscape-stroke:none;stop-color:#000000"
         d="m 66.16697,4.1252291 c 9.180818,0 16.085377,1.0054216 20.713721,3.0162626 6.677007,2.9324773 11.077741,8.5041953 13.202209,16.7151223 1.28985,4.943313 1.9348,11.059638 1.9348,18.348929 v 47.631819 c 0,8.210936 1.06224,14.704298 3.18676,19.480038 2.80736,6.36766 7.73919,9.55151 14.79554,9.55151 V 120 H 103.03064 C 96.050446,117.43779 91.179336,113.34369 88.474073,107.68359 86.197863,102.82405 85.0597,95.450955 85.0597,85.564333 V 38.058184 c 0,-10.975832 -1.517459,-18.851647 -4.552474,-23.627393 C 77.472258,9.6550502 72.692175,7.2671672 66.16697,7.2671672 Z" />
  </svg>`,
  ],
  { type: 'image/svg+xml' },
);
const bracesUrl = URL.createObjectURL(bracesBlob);
root.style.setProperty('--braces-url', `url(${bracesUrl})`);

function* generateIds() {
  for (let i = 0; ; i += 1) {
    yield `id${i}`;
  }
}
const idGenerator = generateIds();
const nextId = () => idGenerator.next().value;

const dateFormatter = new window.Intl.DateTimeFormat(undefined, {
  dateStyle: 'full',
  timeStyle: 'long',
});
const numberFormatter = new Intl.NumberFormat();

const inboxComponent = async ($parent, $end, powers) => {
  $parent.scrollTo(0, $parent.scrollHeight);

  const selfId = await E(powers).identify('SELF');
  for await (const message of makeRefIterator(E(powers).followMessages())) {
    // Read DOM at animation frame to determine whether to pin scroll to bottom
    // of the messages pane.
    const wasAtEnd = await new Promise(resolve =>
      requestAnimationFrame(() => {
        const scrollTop = /** @type {number} */ ($parent.scrollTop);
        const endScrollTop = /** @type {number} */ (
          $parent.scrollHeight - $parent.clientHeight
        );
        resolve(scrollTop > endScrollTop - 10);
      }),
    );

    const { number, type, from: fromId, to: toId, date, dismissed } = message;

    let verb = '';
    if (type === 'request') {
      verb = 'requested';
    } else if (type === 'package') {
      verb = 'sent';
    } else {
      verb = 'sent an unrecognizable message';
    }
    const $verb = document.createElement('em');
    $verb.innerText = verb;

    const $message = document.createElement('div');
    $message.className = 'message';

    const $error = document.createElement('span');
    $error.style.color = 'red';
    $error.innerText = '';
    $message.appendChild($error);

    dismissed.then(() => {
      $message.remove();
    });

    const $number = document.createElement('span');
    $number.innerText = `${number}. `;
    $message.appendChild($number);

    if (fromId === selfId && toId === selfId) {
      $message.appendChild($verb);
    } else if (fromId === selfId) {
      const toName = await E(powers).reverseIdentify(toId);
      if (toName === undefined) {
        continue;
      }
      const $to = document.createElement('strong');
      $to.innerText = ` ${toName} `;
      $message.appendChild($verb);
      $message.appendChild($to);
    } else if (toId === selfId) {
      const fromName = await E(powers).reverseIdentify(fromId);
      if (fromName === undefined) {
        continue;
      }
      const $from = document.createElement('strong');
      $from.innerText = ` ${fromName} `;
      $message.appendChild($from);
      $message.appendChild($verb);
    } else {
      const [fromName, toName] = await Promise.all(
        [fromId, toId].map(id => E(powers).reverseIdentify(id)),
      );
      const $from = document.createElement('strong');
      $from.innerText = ` ${fromName} `;
      const $to = document.createElement('strong');
      $to.innerText = ` ${toName} `;
      $message.appendChild($from);
      $message.appendChild($verb);
      $message.appendChild($to);
    }

    if (message.type === 'request') {
      const { description, settled } = message;

      const $description = document.createElement('span');
      $description.innerText = ` ${JSON.stringify(description)} `;
      $message.appendChild($description);

      const $date = document.createElement('i');
      $date.innerText = dateFormatter.format(Date.parse(date));
      $message.appendChild($date);

      const $input = document.createElement('span');
      $message.appendChild($input);

      const $pet = document.createElement('input');
      $input.appendChild($pet);

      const $resolve = document.createElement('button');
      $resolve.innerText = 'resolve';
      $input.appendChild($resolve);

      const $reject = document.createElement('button');
      $reject.innerText = 'reject';
      $reject.onclick = () => {
        E(powers).reject(number, $pet.value).catch(window.reportError);
      };
      $input.appendChild($reject);

      $resolve.onclick = () => {
        E(powers)
          .resolve(number, $pet.value)
          .catch(error => {
            $error.innerText = ` ${error.message}`;
          });
      };

      settled.then(status => {
        $input.innerText = ` ${status} `;
      });
    } else if (message.type === 'package') {
      const { strings, names } = message;
      assert(Array.isArray(strings));
      assert(Array.isArray(names));

      $message.appendChild(document.createTextNode(' "'));

      let index = 0;
      for (
        index = 0;
        index < Math.min(strings.length, names.length);
        index += 1
      ) {
        assert.typeof(strings[index], 'string');
        const outer = JSON.stringify(strings[index]);
        const inner = outer.slice(1, outer.length - 1);
        $message.appendChild(document.createTextNode(inner));
        assert.typeof(names[index], 'string');
        const name = `@${names[index]}`;
        const $name = document.createElement('b');
        $name.innerText = name;
        $message.appendChild($name);
      }
      if (strings.length > names.length) {
        const outer = JSON.stringify(strings[index]);
        const inner = outer.slice(1, outer.length - 1);
        $message.appendChild(document.createTextNode(inner));
      }

      $message.appendChild(document.createTextNode('" '));

      const $date = document.createElement('i');
      $date.innerText = dateFormatter.format(Date.parse(date));
      $message.appendChild($date);

      $message.appendChild(document.createTextNode(' '));

      if (names.length > 0) {
        const $adoption = document.createElement('span');
        $adoption.className = 'adoption';
        $message.appendChild($adoption);

        const $names = document.createElement('select');
        $adoption.appendChild($names);
        for (const name of names) {
          const $name = document.createElement('option');
          $name.value = name;
          $name.innerText = name;
          $names.appendChild($name);
        }

        $adoption.appendChild(document.createTextNode(' '));

        const $as = document.createElement('input');
        $as.type = 'text';
        $adoption.appendChild($as);

        const handleAdopt = () => {
          console.log($as.value, $as);
          E(powers)
            .adopt(number, $names.value, $as.value || $names.value)
            .then(
              () => {
                $as.value = '';
              },
              error => {
                $error.innerText = ` ${error.message}`;
              },
            );
        };

        $as.addEventListener('keyup', event => {
          const { key, repeat, metaKey } = event;
          if (repeat || metaKey) return;
          if (key === 'Enter') {
            handleAdopt();
          }
        });

        $adoption.appendChild(document.createTextNode(' '));

        const $adopt = document.createElement('button');
        $adopt.innerText = 'Adopt';
        $adoption.appendChild($adopt);
        $adopt.onclick = handleAdopt;
      }
    }

    $message.appendChild(document.createTextNode(' '));

    const $dismiss = document.createElement('button');
    $dismiss.innerText = 'Dismiss';
    $message.appendChild($dismiss);
    $dismiss.onclick = () => {
      E(powers)
        .dismiss(number)
        .catch(error => {
          $error.innerText = ` ${error.message}`;
        });
    };

    $parent.insertBefore($message, $end);

    if (wasAtEnd) {
      $parent.scrollTo(0, $parent.scrollHeight);
    }
  }
};

const inventoryComponent = async ($parent, $end, powers, { showValue }) => {
  const $list = document.createElement('div');
  $list.className = 'pet-list';
  $parent.insertBefore($list, $end);

  const $names = new Map();
  for await (const change of makeRefIterator(E(powers).followNameChanges())) {
    if ('add' in change) {
      const name = change.add;

      const $item = document.createElement('div');
      $item.className = 'pet-item';
      $item.innerHTML = `
        ${name}
        <button class="show-button">Show</button>
        <button class="remove-button">Remove</button>
      `;
      const $show = $item.querySelector('.show-button');
      const $remove = $item.querySelector('.remove-button');
      $list.appendChild($item);

      $show.onclick = () =>
        E(powers).lookup(name).then(showValue, window.reportError);
      $remove.onclick = () => E(powers).remove(name).catch(window.reportError);

      $names.set(name, $item);
    } else if ('remove' in change) {
      const $item = $names.get(change.remove);
      if ($item !== undefined) {
        $item.remove();
        $names.delete(change.remove);
      }
    }
  }
};

const inventorySelectComponent = async ($select, powers) => {
  $select.innerHTML = '';

  const $names = new Map();
  for await (const change of makeRefIterator(E(powers).followNameChanges())) {
    if ('add' in change) {
      const name = change.add;

      const $option = document.createElement('option');
      $select.appendChild($option);

      const $name = document.createTextNode(`${name}`);
      $option.appendChild($name);
      $name.innerText = change.add;

      $names.set(name, $option);
    } else if ('remove' in change) {
      const $option = $names.get(change.remove);
      if ($option !== undefined) {
        $option.remove();
        $names.delete(change.remove);
      }
    }
  }
};

const controlsComponent = (
  $parent,
  { focusChat, blurChat, focusValue, blurValue, focusEval, blurEval },
) => {
  const $cat = $parent.querySelector('#cat');
  const $chatFrame = $parent.querySelector('#chat-frame');
  const $valueFrame = $parent.querySelector('#value-frame');
  const $evalFrame = $parent.querySelector('#eval-frame');
  const $controls = $parent.querySelector('#controls');

  let showFanout = false;

  const showChat = () => {
    $chatFrame.dataset.show = 'true';
    $controls.dataset.show = 'false';
    showFanout = false;
    focusChat();
  };

  const showValue = value => {
    $valueFrame.dataset.show = 'true';
    $controls.dataset.show = 'false';
    showFanout = false;
    focusValue(value);
  };

  const showEval = () => {
    $evalFrame.dataset.show = 'true';
    $controls.dataset.show = 'false';
    showFanout = false;
    focusEval();
  };

  const dismissChat = () => {
    $chatFrame.dataset.show = 'false';
    blurChat();
  };

  const dismissValue = () => {
    $valueFrame.dataset.show = 'false';
    blurValue();
  };

  const dismissEval = () => {
    $evalFrame.dataset.show = 'false';
    blurEval();
  };

  $cat.addEventListener('click', () => {
    showFanout = !showFanout;
    $controls.dataset.show = `${showFanout}`;
  });

  const $chatButton = $parent.querySelector('#chat-button');
  $chatButton.addEventListener('click', () => {
    showChat();
  });

  const $evalButton = $parent.querySelector('#eval-button');
  $evalButton.addEventListener('click', () => {
    showEval();
  });

  // Accelerator:
  window.addEventListener('keyup', event => {
    const { key, repeat, metaKey } = event;
    if (event.target !== document.body) {
      return;
    }
    if (repeat || metaKey) return;
    if (key === '"' || key === "'") {
      showChat();
      event.stopPropagation();
    } else if (key === '.') {
      showEval();
      event.stopPropagation();
    }
  });

  return { dismissChat, showValue, dismissValue, dismissEval };
};

const chatComponent = ($parent, powers, { dismissChat }) => {
  const $chatFrame = $parent.querySelector('#chat-frame');
  const $chatSendButton = $parent.querySelector('#chat-send-button');
  const $chatRecipientSelect = $parent.querySelector('#chat-to');
  const $chatMessageInput = $parent.querySelector('#chat-message');
  const $chatDiscardButton = $parent.querySelector('#chat-discard-button');
  const $chatError = $parent.querySelector('#chat-error');

  $chatDiscardButton.addEventListener('click', () => {
    dismissChat();
  });

  const handleChat = event => {
    event.preventDefault();
    event.stopPropagation();
    const to = $chatRecipientSelect.value;
    const { strings, petNames, edgeNames } = parseMessage(
      $chatMessageInput.value,
    );
    E(powers)
      .send(to, strings, edgeNames, petNames)
      .then(dismissChat, error => {
        $chatError.innerText = error.message;
      });
  };

  $chatFrame.addEventListener('keyup', event => {
    const { key, repeat, metaKey } = event;
    if (repeat || metaKey) return;
    if (key === 'Enter') {
      handleChat(event);
    }
    if (key === 'Escape') {
      dismissChat();
      event.stopPropagation();
    }
  });

  $chatSendButton.addEventListener('click', handleChat);

  const focusChat = () => {
    $chatRecipientSelect.focus();
  };

  const blurChat = () => {
    $chatMessageInput.value = '';
    $chatError.innerText = '';
  };

  inventorySelectComponent($chatRecipientSelect, powers).catch(
    window.reportError,
  );

  return { focusChat, blurChat };
};

const render = value => {
  let passStyle;
  try {
    passStyle = passStyleOf(value);
  } catch {
    const $value = document.createElement('div');
    $value.className = 'error';
    $value.innerText = '⚠️ Not passable ⚠️';
    return $value;
  }

  switch (passStyle) {
    case 'null':
    case 'undefined':
    case 'boolean': {
      const $value = document.createElement('span');
      $value.className = 'number';
      $value.innerText = `${value}`;
      return $value;
    }
    case 'bigint': {
      const $value = document.createElement('span');
      $value.className = 'bigint';
      $value.innerText = `${numberFormatter.format(value)}n`;
      return $value;
    }
    case 'number': {
      const $value = document.createElement('span');
      $value.className = 'number';
      $value.innerText = numberFormatter.format(value);
      return $value;
    }
    case 'string': {
      const $value = document.createElement('span');
      $value.className = 'string';
      $value.innerText = JSON.stringify(value);
      return $value;
    }
    case 'promise': {
      const $value = document.createElement('span');
      $value.innerText = '⏳';
      // TODO await (and respect cancellation)
      return $value;
    }
    case 'copyArray': {
      const $value = document.createElement('div');
      $value.className = 'array';
      for (const child of value) {
        const $child = render(child);
        $value.appendChild($child);
      }
      return $value;
    }
    case 'copyRecord': {
      const $value = document.createElement('div');
      $value.className = 'object';
      for (const [key, child] of Object.entries(value)) {
        const $entry = document.createElement('span');
        $entry.className = 'entry';
        $value.appendChild($entry);
        const $key = document.createElement('span');
        $key.className = 'key';
        $key.innerText = `${key}: `;
        $entry.appendChild($key);
        const $child = render(child);
        $entry.appendChild($child);
      }
      return $value;
    }
    case 'tagged': {
      const $value = document.createElement('span');
      $value.className = 'entry';
      const $tag = document.createElement('span');
      $tag.className = 'key';
      $tag.innerText = `${value[Symbol.toStringTag]}: `;
      $value.appendChild($tag);
      const $child = render(value.payload);
      $value.appendChild($child);
      return $value;
    }
    case 'error': {
      const $value = document.createElement('span');
      $value.className = 'error';
      $value.innerText = value.message;
      return $value;
    }
    case 'remotable': {
      const $value = document.createElement('span');
      $value.className = 'remotable entry';
      $value.innerText = value[Symbol.toStringTag];
      return $value;
    }
    default: {
      throw new Error(
        'Unreachable if programmed to account for all pass-styles',
      );
    }
  }
};

const valueComponent = ($parent, powers, { dismissValue }) => {
  const $frame = $parent.querySelector('#value-frame');
  const $value = $parent.querySelector('#value-value');
  const $close = $parent.querySelector('#value-close');

  const clearValue = () => {
    $value.innerHTML = '';
    dismissValue();
  };

  $close.addEventListener('click', () => {
    clearValue();
  });

  $frame.addEventListener('keyup', event => {
    const { key, repeat, metaKey } = event;
    if (repeat || metaKey) return;
    if (key === 'Escape') {
      clearValue();
      event.stopPropagation();
    }
  });

  const focusValue = value => {
    $value.innerHTML = '';
    $value.appendChild(render(value));
    $close.focus();
  };

  const blurValue = () => {};

  return { focusValue, blurValue };
};

const evalComponent = ($parent, powers, { dismissEval, showValue }) => {
  const $frame = $parent.querySelector('#eval-frame');
  const $source = $parent.querySelector('#eval-source');
  const $endOfEndowments = $parent.querySelector('#eval-endowments');
  const $addEndowment = $parent.querySelector('#eval-add-endowment');
  const $resultName = $parent.querySelector('#eval-result-name');
  const $submit = $parent.querySelector('#eval-submit-button');
  const $discard = $parent.querySelector('#eval-discard-button');
  let $error = $parent.querySelector('#eval-error');
  const $endowments = new Map();

  const resizeSource = () => {
    // This is a pretty terrible thing to do because it forces a pair of sync
    // draws that compose poorly.
    // To do better, we would need a read/write frame coordinator.
    $source.style.height = '1px';
    $source.style.height = `${$source.scrollHeight + 2}px`;
  };

  const clearEval = () => {
    $source.value = '';
    resizeSource();
    $resultName.value = '';
    for (const $endowment of $endowments.values()) {
      $endowment.remove();
    }
    $endowments.clear();
    const $newError = document.createTextNode('');
    $error.replaceWith($newError);
    $error = $newError;
    dismissEval();
  };

  $discard.addEventListener('click', () => {
    clearEval();
  });

  const handleRemoveEndowment = event => {
    const { target } = event;
    const id = target.getAttribute('id');
    const $endowment = $endowments.get(id);
    if ($endowment === undefined) {
      throw new Error(`Endowment does not exist for id ${id}`);
    }
    $endowments.delete(id);
    $endowment.remove();
  };

  const handleAddEndowment = () => {
    const $endowment = document.createElement('p');
    const codeNameId = nextId();
    const petNameId = nextId();
    const removeId = nextId();

    $endowment.innerHTML = `
      <label for="${codeNameId}">
        Name in source:
        <input id="${codeNameId}" type="text" class="big half-wide code-name">
      </label>
      <label for="${petNameId}">
        Pet name:
        <input id="${petNameId}" type="text" class="big half-wide pet-name">
      </label>
      <button id="${removeId}">Remove</button>
    `;

    const $remove = $endowment.querySelector(`#${removeId}`);
    $remove.addEventListener('click', handleRemoveEndowment);
    $endOfEndowments.parentElement.insertBefore($endowment, $endOfEndowments);
    $endowments.set(removeId, $endowment);

    const $codeName = $endowment.querySelector('.code-name');
    $codeName.focus();
  };

  $addEndowment.addEventListener('click', handleAddEndowment);

  const handleEval = () => {
    const source = $source.value;
    const workerName = 'MAIN';
    const names = Array.from($endowments.values(), $endowment => {
      const $codeName = $endowment.querySelector('.code-name');
      const $petName = $endowment.querySelector('.pet-name');
      return {
        petName: $petName.value,
        codeName: $codeName.value,
      };
    });
    const codeNames = names.map(({ codeName }) => codeName);
    const petNames = names.map(({ petName }) => petName);
    const resultName = $resultName.value.trim() || undefined;
    E(powers)
      .evaluate(workerName, source, codeNames, petNames, resultName)
      .then(
        value => {
          clearEval();
          showValue(value);
        },
        error => {
          const $newError = document.createElement('p');
          $newError.className = 'error';
          $newError.innerText = error.message;
          $error.replaceWith($newError);
          $error = $newError;
        },
      );
  };

  $frame.addEventListener('keyup', event => {
    const { key, repeat, metaKey } = event;
    if (repeat || metaKey) return;
    if (key === 'Escape') {
      clearEval();
      event.stopPropagation();
    }
  });

  $submit.addEventListener('click', event => {
    event.stopPropagation();
    handleEval();
  });

  const focusEval = () => {
    $source.focus();
  };

  const blurEval = () => {
    $source.value = '';
    $error.innerText = '';
  };

  // Automatically adjust the textarea height to match its content.
  $source.addEventListener('input', () => {
    resizeSource();
  });

  return { focusEval, blurEval };
};

const bodyComponent = ($parent, powers) => {
  $parent.innerHTML = template;

  const $messages = $parent.querySelector('#messages');
  const $anchor = $parent.querySelector('#anchor');
  const $pets = $parent.querySelector('#pets');

  // To they who can avoid forward-references for entangled component
  // dependency-injection, I salute you and welcome your pull requests.
  /* eslint-disable no-use-before-define */
  const { dismissChat, showValue, dismissValue, dismissEval } =
    controlsComponent($parent, {
      focusChat: () => focusChat(),
      blurChat: () => blurChat(),
      focusValue: value => focusValue(value),
      blurValue: () => blurValue(),
      focusEval: () => focusEval(),
      blurEval: () => blurEval(),
    });
  inboxComponent($messages, $anchor, powers).catch(window.reportError);
  inventoryComponent($pets, null, powers, { showValue }).catch(
    window.reportError,
  );
  const { focusChat, blurChat } = chatComponent($parent, powers, {
    dismissChat,
  });
  const { focusValue, blurValue } = valueComponent($parent, powers, {
    dismissValue,
  });
  const { focusEval, blurEval } = evalComponent($parent, powers, {
    showValue,
    dismissEval,
  });
  /* eslint-enable no-use-before-define */
};

export const make = async powers => {
  document.body.innerHTML = '';
  bodyComponent(document.body, powers);
};
