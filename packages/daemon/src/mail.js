// @ts-check

import { makePromiseKit } from '@endo/promise-kit';
import { makeChangeTopic } from './pubsub.js';
import { assertPetName } from './pet-name.js';

const { quote: q } = assert;

/**
 * @param {object} args
 * @param {import('./types.js').DaemonCore['provide']} args.provide
 * @param {import('./types.js').DaemonCore['provideControllerAndResolveHandle']} args.provideControllerAndResolveHandle
 * @returns {import('./types.js').MakeMailbox}
 */
export const makeMailboxMaker = ({
  provide,
  provideControllerAndResolveHandle,
}) => {
  /**
    @type {import('./types.js').MakeMailbox} */
  const makeMailbox = ({ selfId, petStore, context }) => {
    /** @type {Map<string, Promise<unknown>>} */
    const responses = new Map();
    /** @type {Map<number, import('./types.js').Message>} */
    const messages = new Map();
    /** @type {WeakMap<object, (id: string | Promise<string>) => void>} */
    const resolvers = new WeakMap();
    /** @type {WeakMap<object, () => void>} */
    const dismissers = new WeakMap();
    /** @type {import('./types.js').Topic<import('./types.js').Message>} */
    const messagesTopic = makeChangeTopic();
    let nextMessageNumber = 0;

    /** @type {import('./types.js').Mail['listMessages']} */
    const listMessages = async () => harden(Array.from(messages.values()));

    /** @type {import('./types.js').Mail['followMessages']} */
    const followMessages = async function* currentAndSubsequentMessages() {
      const subsequentRequests = messagesTopic.subscribe();
      yield* messages.values();
      yield* subsequentRequests;
    };

    /**
     * @param {object} partialMessage
     * @returns {import('./types.js').Message}
     */
    const deliver = partialMessage => {
      /** @type {import('@endo/promise-kit/src/types.js').PromiseKit<void>} */
      const dismissal = makePromiseKit();
      const messageNumber = nextMessageNumber;
      nextMessageNumber += 1;

      const message = harden({
        ...partialMessage,
        number: messageNumber,
        date: new Date().toISOString(),
        dismissed: dismissal.promise,
      });

      dismissers.set(message, () => {
        messages.delete(messageNumber);
        dismissal.resolve();
      });

      messages.set(messageNumber, message);
      messagesTopic.publisher.next(message);

      return message;
    };

    /**
     * @param {string} description
     * @param {string} fromId
     * @param {string} toId
     * @returns {Promise<string>}
     */
    const requestId = async (description, fromId, toId) => {
      /** @type {import('@endo/promise-kit/src/types.js').PromiseKit<string>} */
      const { promise, resolve } = makePromiseKit();
      const settled = promise.then(
        () => 'fulfilled',
        () => 'rejected',
      );
      const message = deliver({
        type: /** @type {const} */ ('request'),
        from: fromId,
        to: toId,
        description,
        settled,
      });
      resolvers.set(message, resolve);
      return promise;
    };

    /** @type {import('./types.js').Mail['respond']} */
    const respond = async (
      description,
      responseName,
      fromId,
      senderPetStore,
      toId = selfId,
    ) => {
      if (responseName !== undefined) {
        /** @type {string | undefined} */
        let id = senderPetStore.identifyLocal(responseName);
        if (id === undefined) {
          id = await requestId(description, fromId, toId);
          await senderPetStore.write(responseName, id);
        }
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        return provide(id);
      }
      // The reference is not named nor to be named.
      const id = await requestId(description, fromId, toId);
      // TODO:
      // context.thisDiesIfThatDies(id);
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      return provide(id);
    };

    /** @type {import('./types.js').Mail['resolve']} */
    const resolve = async (messageNumber, resolutionName) => {
      assertPetName(resolutionName);
      if (
        typeof messageNumber !== 'number' ||
        messageNumber >= Number.MAX_SAFE_INTEGER
      ) {
        throw new Error(`Invalid request number ${q(messageNumber)}`);
      }
      const req = messages.get(messageNumber);
      const resolveId = resolvers.get(req);
      if (resolveId === undefined) {
        throw new Error(`No pending request for number ${messageNumber}`);
      }
      const id = petStore.identifyLocal(resolutionName);
      if (id === undefined) {
        throw new TypeError(
          `No formula exists for the pet name ${q(resolutionName)}`,
        );
      }
      resolveId(id);
    };

    // TODO test reject
    /** @type {import('./types.js').Mail['reject']} */
    const reject = async (messageNumber, message = 'Declined') => {
      const req = messages.get(messageNumber);
      if (req !== undefined) {
        const resolveId = resolvers.get(req);
        if (resolveId === undefined) {
          throw new Error(`panic: a resolver must exist for every request`);
        }
        resolveId(harden(Promise.reject(harden(new Error(message)))));
      }
    };

    /** @type {import('./types.js').Mail['receive']} */
    const receive = (fromId, strings, names, ids, toId = selfId) => {
      deliver({
        type: /** @type {const} */ ('package'),
        strings,
        names,
        ids,
        from: fromId,
        to: toId,
      });
    };

    /** @type {import('./types.js').Mail['send']} */
    const send = async (toName, strings, edgeNames, petNames) => {
      const toId = petStore.identifyLocal(toName);
      if (toId === undefined) {
        throw new Error(`Unknown pet name for agent: ${toName}`);
      }
      const recipientController = await provideControllerAndResolveHandle(toId);
      const recipientInternal = await recipientController.internal;
      if (recipientInternal === undefined || recipientInternal === null) {
        throw new Error(`Recipient cannot receive messages: ${toName}`);
      }
      // @ts-expect-error We check if its undefined immediately after
      const { receive: agentReceive } = recipientInternal;
      if (agentReceive === undefined) {
        throw new Error(`Recipient cannot receive messages: ${toName}`);
      }

      petNames.forEach(assertPetName);
      edgeNames.forEach(assertPetName);
      if (petNames.length !== edgeNames.length) {
        throw new Error(
          `Message must have one edge name (${q(
            edgeNames.length,
          )}) for every pet name (${q(petNames.length)})`,
        );
      }
      if (strings.length < petNames.length) {
        throw new Error(
          `Message must have one string before every value delivered`,
        );
      }

      const ids = petNames.map(petName => {
        const id = petStore.identifyLocal(petName);
        if (id === undefined) {
          throw new Error(`Unknown pet name ${q(petName)}`);
        }
        return id;
      });
      // add to recipient mailbox
      agentReceive(selfId, strings, edgeNames, ids);
      // add to own mailbox
      receive(
        selfId,
        strings,
        edgeNames,
        ids,
        // Sender expects the handle formula identifier.
        toId,
      );
    };

    /** @type {import('./types.js').Mail['dismiss']} */
    const dismiss = async messageNumber => {
      if (
        typeof messageNumber !== 'number' ||
        messageNumber >= Number.MAX_SAFE_INTEGER
      ) {
        throw new Error(`Invalid request number ${q(messageNumber)}`);
      }
      const message = messages.get(messageNumber);
      const dismissMessage = dismissers.get(message);
      if (dismissMessage === undefined) {
        throw new Error(`No dismissable message for number ${messageNumber}`);
      }
      dismissMessage();
    };

    /** @type {import('./types.js').Mail['adopt']} */
    const adopt = async (messageNumber, edgeName, petName) => {
      assertPetName(edgeName);
      assertPetName(petName);
      if (
        typeof messageNumber !== 'number' ||
        messageNumber >= Number.MAX_SAFE_INTEGER
      ) {
        throw new Error(`Invalid message number ${q(messageNumber)}`);
      }
      const message = messages.get(messageNumber);
      if (message === undefined) {
        throw new Error(`No such message with number ${q(messageNumber)}`);
      }
      if (message.type !== 'package') {
        throw new Error(`Message must be a package ${q(messageNumber)}`);
      }
      const index = message.names.lastIndexOf(edgeName);
      if (index === -1) {
        throw new Error(
          `No reference named ${q(edgeName)} in message ${q(messageNumber)}`,
        );
      }
      const id = message.ids[index];
      if (id === undefined) {
        throw new Error(
          `panic: message must contain a formula for every name, including the name ${q(
            edgeName,
          )} at ${q(index)}`,
        );
      }
      context.thisDiesIfThatDies(id);
      await petStore.write(petName, id);
    };

    /** @type {import('./types.js').Mail['request']} */
    const request = async (toName, description, responseName) => {
      const toId = petStore.identifyLocal(toName);
      if (toId === undefined) {
        throw new Error(`Unknown pet name for agent: ${toName}`);
      }
      const recipientController = await provideControllerAndResolveHandle(toId);
      const recipientInternal = await recipientController.internal;
      if (recipientInternal === undefined || recipientInternal === null) {
        throw new Error(
          `panic: a receive request function must exist for every agent`,
        );
      }

      // @ts-expect-error We sufficiently check if recipientInternal or deliverToRecipient is undefined
      const { respond: deliverToRecipient } = recipientInternal;
      if (deliverToRecipient === undefined) {
        throw new Error(
          `panic: a receive request function must exist for every agent`,
        );
      }

      if (responseName !== undefined) {
        const responseP = responses.get(responseName);
        if (responseP !== undefined) {
          return responseP;
        }
      }

      // Note: consider sending to each mailbox with different powers.
      // Behold, recursion:
      // eslint-disable-next-line
      const recipientResponseP = deliverToRecipient(
        description,
        responseName,
        selfId,
        petStore,
      );
      // Send to own inbox.
      const selfResponseP = respond(
        description,
        responseName,
        selfId,
        petStore,
        // Sender expects the handle formula identifier.
        toId,
      );
      const newResponseP = Promise.race([recipientResponseP, selfResponseP]);

      if (responseName !== undefined) {
        responses.set(responseName, newResponseP);
      }

      return newResponseP;
    };

    /** @type {import('./types.js').PetStore['rename']} */
    const rename = async (fromName, toName) => {
      await petStore.rename(fromName, toName);
      const id = responses.get(fromName);
      if (id !== undefined) {
        responses.set(toName, id);
        responses.delete(fromName);
      }
    };

    /** @type {import('./types.js').PetStore['remove']} */
    const remove = async petName => {
      await petStore.remove(petName);
      responses.delete(petName);
    };

    /** @type {import('./types.js').PetStore} */
    const mailStore = {
      ...petStore,
      rename,
      remove,
    };

    return harden({
      petStore: mailStore,
      listMessages,
      followMessages,
      request,
      respond,
      receive,
      send,
      resolve,
      reject,
      dismiss,
      adopt,
    });
  };

  return makeMailbox;
};
