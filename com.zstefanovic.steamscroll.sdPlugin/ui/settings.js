/**!
 * @author Elgato
 * @module elgato/streamdeck
 * @license MIT
 * @copyright Copyright (c) Corsair Memory Inc.
 */
/**
 * Stream Deck device types.
 */
var DeviceType;
(function (DeviceType) {
    /**
     * Stream Deck, comprised of 15 customizable LCD keys in a 5 x 3 layout.
     */
    DeviceType[DeviceType["StreamDeck"] = 0] = "StreamDeck";
    /**
     * Stream Deck Mini, comprised of 6 customizable LCD keys in a 3 x 2 layout.
     */
    DeviceType[DeviceType["StreamDeckMini"] = 1] = "StreamDeckMini";
    /**
     * Stream Deck XL, comprised of 32 customizable LCD keys in an 8 x 4 layout.
     */
    DeviceType[DeviceType["StreamDeckXL"] = 2] = "StreamDeckXL";
    /**
     * Stream Deck Mobile, for iOS and Android.
     */
    DeviceType[DeviceType["StreamDeckMobile"] = 3] = "StreamDeckMobile";
    /**
     * Corsair G Keys, available on select Corsair keyboards.
     */
    DeviceType[DeviceType["CorsairGKeys"] = 4] = "CorsairGKeys";
    /**
     * Stream Deck Pedal, comprised of 3 customizable pedals.
     */
    DeviceType[DeviceType["StreamDeckPedal"] = 5] = "StreamDeckPedal";
    /**
     * Corsair Voyager laptop, comprising 10 buttons in a horizontal line above the keyboard.
     */
    DeviceType[DeviceType["CorsairVoyager"] = 6] = "CorsairVoyager";
    /**
     * Stream Deck +, comprised of 8 customizable LCD keys in a 4 x 2 layout, a touch strip, and 4 dials.
     */
    DeviceType[DeviceType["StreamDeckPlus"] = 7] = "StreamDeckPlus";
    /**
     * SCUF controller G keys, available on select SCUF controllers, for example SCUF Envision.
     */
    DeviceType[DeviceType["SCUFController"] = 8] = "SCUFController";
    /**
     * Stream Deck Neo, comprised of 8 customizable LCD keys in a 4 x 2 layout, an info bar, and 2 touch points for page navigation.
     */
    DeviceType[DeviceType["StreamDeckNeo"] = 9] = "StreamDeckNeo";
})(DeviceType || (DeviceType = {}));

/**
 * List of available types that can be applied to {@link Bar} and {@link GBar} to determine their style.
 */
var BarSubType;
(function (BarSubType) {
    /**
     * Rectangle bar; the bar fills from left to right, determined by the {@link Bar.value}, similar to a standard progress bar.
     */
    BarSubType[BarSubType["Rectangle"] = 0] = "Rectangle";
    /**
     * Rectangle bar; the bar fills outwards from the centre of the bar, determined by the {@link Bar.value}.
     * @example
     * // Value is 2, range is 1-10.
     * // [  ███     ]
     * @example
     * // Value is 10, range is 1-10.
     * // [     █████]
     */
    BarSubType[BarSubType["DoubleRectangle"] = 1] = "DoubleRectangle";
    /**
     * Trapezoid bar, represented as a right-angle triangle; the bar fills from left to right, determined by the {@link Bar.value}, similar to a volume meter.
     */
    BarSubType[BarSubType["Trapezoid"] = 2] = "Trapezoid";
    /**
     * Trapezoid bar, represented by two right-angle triangles; the bar fills outwards from the centre of the bar, determined by the {@link Bar.value}. See {@link BarSubType.DoubleRectangle}.
     */
    BarSubType[BarSubType["DoubleTrapezoid"] = 3] = "DoubleTrapezoid";
    /**
     * Rounded rectangle bar; the bar fills from left to right, determined by the {@link Bar.value}, similar to a standard progress bar.
     */
    BarSubType[BarSubType["Groove"] = 4] = "Groove";
})(BarSubType || (BarSubType = {}));

/**!
 * @author Elgato
 * @module elgato/streamdeck
 * @license MIT
 * @copyright Copyright (c) Corsair Memory Inc.
 */

// Polyfill, explicit resource management https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#using-declarations-and-explicit-resource-management
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Symbol.dispose ??= Symbol("Symbol.dispose");
/**
 * Creates a {@link IDisposable} that defers the disposing to the {@link dispose} function; disposing is guarded so that it may only occur once.
 * @param dispose Function responsible for disposing.
 * @returns Disposable whereby the disposing is delegated to the {@link dispose}  function.
 */
function deferredDisposable(dispose) {
    let isDisposed = false;
    const guardedDispose = () => {
        if (!isDisposed) {
            dispose();
            isDisposed = true;
        }
    };
    return {
        [Symbol.dispose]: guardedDispose,
        dispose: guardedDispose,
    };
}

/**
 * An event emitter that enables the listening for, and emitting of, events.
 */
class EventEmitter {
    /**
     * Underlying collection of events and their listeners.
     */
    events = new Map();
    /**
     * Adds the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the {@link listener} added.
     */
    addListener(eventName, listener) {
        return this.on(eventName, listener);
    }
    /**
     * Adds the event {@link listener} for the event named {@link eventName}, and returns a disposable capable of removing the event listener.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns A disposable that removes the listener when disposed.
     */
    disposableOn(eventName, listener) {
        this.addListener(eventName, listener);
        return deferredDisposable(() => this.removeListener(eventName, listener));
    }
    /**
     * Emits the {@link eventName}, invoking all event listeners with the specified {@link args}.
     * @param eventName Name of the event.
     * @param args Arguments supplied to each event listener.
     * @returns `true` when there was a listener associated with the event; otherwise `false`.
     */
    emit(eventName, ...args) {
        const listeners = this.events.get(eventName);
        if (listeners === undefined) {
            return false;
        }
        for (let i = 0; i < listeners.length;) {
            const { listener, once } = listeners[i];
            if (once) {
                listeners.splice(i, 1);
            }
            else {
                i++;
            }
            listener(...args);
        }
        return true;
    }
    /**
     * Gets the event names with event listeners.
     * @returns Event names.
     */
    eventNames() {
        return Array.from(this.events.keys());
    }
    /**
     * Gets the number of event listeners for the event named {@link eventName}. When a {@link listener} is defined, only matching event listeners are counted.
     * @param eventName Name of the event.
     * @param listener Optional event listener to count.
     * @returns Number of event listeners.
     */
    listenerCount(eventName, listener) {
        const listeners = this.events.get(eventName);
        if (listeners === undefined || listener == undefined) {
            return listeners?.length || 0;
        }
        let count = 0;
        listeners.forEach((ev) => {
            if (ev.listener === listener) {
                count++;
            }
        });
        return count;
    }
    /**
     * Gets the event listeners for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @returns The event listeners.
     */
    listeners(eventName) {
        return Array.from(this.events.get(eventName) || []).map(({ listener }) => listener);
    }
    /**
     * Removes the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} removed.
     */
    off(eventName, listener) {
        const listeners = this.events.get(eventName) || [];
        for (let i = listeners.length - 1; i >= 0; i--) {
            if (listeners[i].listener === listener) {
                listeners.splice(i, 1);
            }
        }
        return this;
    }
    /**
     * Adds the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} added.
     */
    on(eventName, listener) {
        return this.add(eventName, (listeners) => listeners.push({ listener }));
    }
    /**
     * Adds the **one-time** event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} added.
     */
    once(eventName, listener) {
        return this.add(eventName, (listeners) => listeners.push({ listener, once: true }));
    }
    /**
     * Adds the event {@link listener} to the beginning of the listeners for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} prepended.
     */
    prependListener(eventName, listener) {
        return this.add(eventName, (listeners) => listeners.splice(0, 0, { listener }));
    }
    /**
     * Adds the **one-time** event {@link listener} to the beginning of the listeners for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} prepended.
     */
    prependOnceListener(eventName, listener) {
        return this.add(eventName, (listeners) => listeners.splice(0, 0, { listener, once: true }));
    }
    /**
     * Removes all event listeners for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @returns This instance with the event listeners removed
     */
    removeAllListeners(eventName) {
        this.events.delete(eventName);
        return this;
    }
    /**
     * Removes the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} removed.
     */
    removeListener(eventName, listener) {
        return this.off(eventName, listener);
    }
    /**
     * Adds the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param fn Function responsible for adding the new event handler function.
     * @returns This instance with event {@link listener} added.
     */
    add(eventName, fn) {
        let listeners = this.events.get(eventName);
        if (listeners === undefined) {
            listeners = [];
            this.events.set(eventName, listeners);
        }
        fn(listeners);
        return this;
    }
}

/**
 * Wraps an underlying Promise{T}, exposing the resolve and reject delegates as methods, allowing for it to be awaited, resolved, or rejected externally.
 */
class PromiseCompletionSource {
    /**
     * The underlying promise that this instance is managing.
     */
    _promise;
    /**
     * Delegate used to reject the promise.
     */
    _reject;
    /**
     * Delegate used to resolve the promise.
     */
    _resolve;
    /**
     * Wraps an underlying Promise{T}, exposing the resolve and reject delegates as methods, allowing for it to be awaited, resolved, or rejected externally.
     */
    constructor() {
        this._promise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
    }
    /**
     * Gets the underlying promise being managed by this instance.
     * @returns The promise.
     */
    get promise() {
        return this._promise;
    }
    /**
     * Rejects the promise, causing any awaited calls to throw.
     * @param reason The reason for rejecting the promise.
     */
    setException(reason) {
        if (this._reject) {
            this._reject(reason);
        }
    }
    /**
     * Sets the result of the underlying promise, allowing any awaited calls to continue invocation.
     * @param value The value to resolve the promise with.
     */
    setResult(value) {
        if (this._resolve) {
            this._resolve(value);
        }
    }
}

/**
 * Connection used by the UI to communicate with the plugin, and Stream Deck.
 */
class Connection extends EventEmitter {
    /**
     * Determines whether the connection can connect;
     */
    canConnect = true;
    /**
     * Underlying web socket connection.
     */
    connection = new PromiseCompletionSource();
    /**
     * Underlying connection information provided to the plugin to establish a connection with Stream Deck.
     */
    info = new PromiseCompletionSource();
    /**
     * Initializes a new instance of the {@link Connection} class.
     */
    constructor() {
        super();
        window.connectElgatoStreamDeckSocket = (port, uuid, event, info, actionInfo) => {
            return this.connect(port, uuid, event, JSON.parse(info), JSON.parse(actionInfo));
        };
    }
    /**
     * Gets the connection's information.
     * @returns The information used to establish the connection.
     */
    async getInfo() {
        return this.info.promise;
    }
    /**
     * Sends the commands to the Stream Deck, once the connection has been established and registered.
     * @param command Command being sent.
     * @returns `Promise` resolved when the command is sent to Stream Deck.
     */
    async send(command) {
        const connection = await this.connection.promise;
        const message = JSON.stringify(command);
        connection.send(message);
    }
    /**
     * Establishes a connection with Stream Deck, allowing for the UI to send and receive messages.
     * @param port Port to be used when connecting to Stream Deck.
     * @param uuid Identifies the UI; this must be provided when establishing the connection with Stream Deck.
     * @param event Name of the event that identifies the registration procedure; this must be provided when establishing the connection with Stream Deck.
     * @param info Information about the Stream Deck application, the plugin, the user's operating system, user's Stream Deck devices, etc.
     * @param actionInfo Information for the action associated with the UI.
     * @returns A promise that is resolved when a connection has been established.
     */
    async connect(port, uuid, event, info, actionInfo) {
        if (this.canConnect) {
            this.canConnect = false;
            this.emit("connecting", info, actionInfo);
            const webSocket = new WebSocket(`ws://127.0.0.1:${port}`);
            webSocket.onmessage = (ev) => this.tryEmit(ev);
            webSocket.onopen = () => {
                webSocket.send(JSON.stringify({ event, uuid }));
                this.connection.setResult(webSocket);
                // As the emitter does not awaiter listeners, we are safe from dead-locking against the listener calling `getInfo()`.
                this.emit("connected", info, actionInfo);
                this.info.setResult({ uuid, info, actionInfo });
            };
        }
        await this.connection.promise;
    }
    /**
     * Attempts to emit the {@link ev} that was received from the {@link Connection.connection}.
     * @param ev Event message data received from Stream Deck.
     */
    tryEmit(ev) {
        const message = JSON.parse(ev.data);
        if (message.event) {
            this.emit(message.event, message);
        }
    }
}
const connection = new Connection();

/**
 * Languages supported by Stream Deck.
 */
const supportedLanguages = ["de", "en", "es", "fr", "ja", "ko", "zh_CN", "zh_TW"];

/**
 * Defines the type of argument supplied by Stream Deck.
 */
var RegistrationParameter;
(function (RegistrationParameter) {
    /**
     * Identifies the argument that specifies the web socket port that Stream Deck is listening on.
     */
    RegistrationParameter["Port"] = "-port";
    /**
     * Identifies the argument that supplies information about the Stream Deck and the plugin.
     */
    RegistrationParameter["Info"] = "-info";
    /**
     * Identifies the argument that specifies the unique identifier that can be used when registering the plugin.
     */
    RegistrationParameter["PluginUUID"] = "-pluginUUID";
    /**
     * Identifies the argument that specifies the event to be sent to Stream Deck as part of the registration procedure.
     */
    RegistrationParameter["RegisterEvent"] = "-registerEvent";
})(RegistrationParameter || (RegistrationParameter = {}));

/**
 * Defines the target of a request, i.e. whether the request should update the Stream Deck hardware, Stream Deck software (application), or both, when calling `setImage` and `setState`.
 */
var Target;
(function (Target) {
    /**
     * Hardware and software should be updated as part of the request.
     */
    Target[Target["HardwareAndSoftware"] = 0] = "HardwareAndSoftware";
    /**
     * Hardware only should be updated as part of the request.
     */
    Target[Target["Hardware"] = 1] = "Hardware";
    /**
     * Software only should be updated as part of the request.
     */
    Target[Target["Software"] = 2] = "Software";
})(Target || (Target = {}));

/**
 * Prevents the modification of existing property attributes and values on the value, and all of its child properties, and prevents the addition of new properties.
 * @param value Value to freeze.
 */
function freeze(value) {
    if (value !== undefined && value !== null && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.values(value).forEach(freeze);
    }
}
/**
 * Gets the value at the specified {@link path}.
 * @param path Path to the property to get.
 * @param source Source object that is being read from.
 * @returns Value of the property.
 */
function get(path, source) {
    const props = path.split(".");
    return props.reduce((obj, prop) => obj && obj[prop], source);
}

/**
 * Internalization provider, responsible for managing localizations and translating resources.
 */
class I18nProvider {
    language;
    readTranslations;
    /**
     * Default language to be used when a resource does not exist for the desired language.
     */
    static DEFAULT_LANGUAGE = "en";
    /**
     * Map of localized resources, indexed by their language.
     */
    _translations = new Map();
    /**
     * Initializes a new instance of the {@link I18nProvider} class.
     * @param language The default language to be used when retrieving translations for a given key.
     * @param readTranslations Function responsible for loading translations.
     */
    constructor(language, readTranslations) {
        this.language = language;
        this.readTranslations = readTranslations;
    }
    /**
     * Translates the specified {@link key}, as defined within the resources for the {@link language}. When the key is not found, the default language is checked.
     *
     * Alias of `I18nProvider.translate(string, Language)`
     * @param key Key of the translation.
     * @param language Optional language to get the translation for; otherwise the default language.
     * @returns The translation; otherwise the key.
     */
    t(key, language = this.language) {
        return this.translate(key, language);
    }
    /**
     * Translates the specified {@link key}, as defined within the resources for the {@link language}. When the key is not found, the default language is checked.
     * @param key Key of the translation.
     * @param language Optional language to get the translation for; otherwise the default language.
     * @returns The translation; otherwise the key.
     */
    translate(key, language = this.language) {
        // When the language and default are the same, only check the language.
        if (language === I18nProvider.DEFAULT_LANGUAGE) {
            return get(key, this.getTranslations(language))?.toString() || key;
        }
        // Otherwise check the language and default.
        return (get(key, this.getTranslations(language))?.toString() ||
            get(key, this.getTranslations(I18nProvider.DEFAULT_LANGUAGE))?.toString() ||
            key);
    }
    /**
     * Gets the translations for the specified language.
     * @param language Language whose translations are being retrieved.
     * @returns The translations, otherwise `null`.
     */
    getTranslations(language) {
        let translations = this._translations.get(language);
        if (translations === undefined) {
            translations = supportedLanguages.includes(language) ? this.readTranslations(language) : null;
            freeze(translations);
            this._translations.set(language, translations);
        }
        return translations;
    }
}
/**
 * Parses the localizations from the specified contents, or throws a `TypeError` when unsuccessful.
 * @param contents Contents that represent the stringified JSON containing the localizations.
 * @returns The localizations; otherwise a `TypeError`.
 */
function parseLocalizations(contents) {
    const json = JSON.parse(contents);
    if (json !== undefined && json !== null && typeof json === "object" && "Localization" in json) {
        return json["Localization"];
    }
    throw new TypeError(`Translations must be a JSON object nested under a property named "Localization"`);
}

/**
 * Levels of logging.
 */
var LogLevel;
(function (LogLevel) {
    /**
     * Error message used to indicate an error was thrown, or something critically went wrong.
     */
    LogLevel[LogLevel["ERROR"] = 0] = "ERROR";
    /**
     * Warning message used to indicate something went wrong, but the application is able to recover.
     */
    LogLevel[LogLevel["WARN"] = 1] = "WARN";
    /**
     * Information message for general usage.
     */
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    /**
     * Debug message used to detail information useful for profiling the applications runtime.
     */
    LogLevel[LogLevel["DEBUG"] = 3] = "DEBUG";
    /**
     * Trace message used to monitor low-level information such as method calls, performance tracking, etc.
     */
    LogLevel[LogLevel["TRACE"] = 4] = "TRACE";
})(LogLevel || (LogLevel = {}));

/**
 * Provides a {@link LogTarget} that logs to the console.
 */
class ConsoleTarget {
    /**
     * @inheritdoc
     */
    write(entry) {
        switch (entry.level) {
            case LogLevel.ERROR:
                console.error(...entry.data);
                break;
            case LogLevel.WARN:
                console.warn(...entry.data);
                break;
            default:
                console.log(...entry.data);
        }
    }
}

// Remove any dependencies on node.
const EOL = "\n";
/**
 * Creates a new string log entry formatter.
 * @param opts Options that defines the type for the formatter.
 * @returns The string {@link LogEntryFormatter}.
 */
function stringFormatter(opts) {
    {
        return ({ data }) => `${reduce(data)}`;
    }
}
/**
 * Stringifies the provided data parameters that make up the log entry.
 * @param data Data parameters.
 * @returns The data represented as a single `string`.
 */
function reduce(data) {
    let result = "";
    let previousWasError = false;
    for (const value of data) {
        // When the value is an error, write the stack.
        if (typeof value === "object" && value instanceof Error) {
            result += `${EOL}${value.stack}`;
            previousWasError = true;
            continue;
        }
        // When the previous was an error, write a new line.
        if (previousWasError) {
            result += EOL;
            previousWasError = false;
        }
        result += typeof value === "object" ? JSON.stringify(value) : value;
        result += " ";
    }
    return result.trimEnd();
}

/**
 * Logger capable of forwarding messages to a {@link LogTarget}.
 */
class Logger {
    /**
     * Backing field for the {@link Logger.level}.
     */
    _level;
    /**
     * Options that define the loggers behavior.
     */
    options;
    /**
     * Scope associated with this {@link Logger}.
     */
    scope;
    /**
     * Initializes a new instance of the {@link Logger} class.
     * @param opts Options that define the loggers behavior.
     */
    constructor(opts) {
        this.options = { minimumLevel: LogLevel.TRACE, ...opts };
        this.scope = this.options.scope === undefined || this.options.scope.trim() === "" ? "" : this.options.scope;
        if (typeof this.options.level !== "function") {
            this.setLevel(this.options.level);
        }
    }
    /**
     * Gets the {@link LogLevel}.
     * @returns The {@link LogLevel}.
     */
    get level() {
        if (this._level !== undefined) {
            return this._level;
        }
        return typeof this.options.level === "function" ? this.options.level() : this.options.level;
    }
    /**
     * Creates a scoped logger with the given {@link scope}; logs created by scoped-loggers include their scope to enable their source to be easily identified.
     * @param scope Value that represents the scope of the new logger.
     * @returns The scoped logger, or this instance when {@link scope} is not defined.
     */
    createScope(scope) {
        scope = scope.trim();
        if (scope === "") {
            return this;
        }
        return new Logger({
            ...this.options,
            level: () => this.level,
            scope: this.options.scope ? `${this.options.scope}->${scope}` : scope,
        });
    }
    /**
     * Writes the arguments as a debug log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    debug(...data) {
        return this.write({ level: LogLevel.DEBUG, data, scope: this.scope });
    }
    /**
     * Writes the arguments as error log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    error(...data) {
        return this.write({ level: LogLevel.ERROR, data, scope: this.scope });
    }
    /**
     * Writes the arguments as an info log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    info(...data) {
        return this.write({ level: LogLevel.INFO, data, scope: this.scope });
    }
    /**
     * Sets the log-level that determines which logs should be written. The specified level will be inherited by all scoped loggers unless they have log-level explicitly defined.
     * @param level The log-level that determines which logs should be written; when `undefined`, the level will be inherited from the parent logger, or default to the environment level.
     * @returns This instance for chaining.
     */
    setLevel(level) {
        if (level !== undefined && level > this.options.minimumLevel) {
            this._level = LogLevel.INFO;
            this.warn(`Log level cannot be set to ${LogLevel[level]} whilst not in debug mode.`);
        }
        else {
            this._level = level;
        }
        return this;
    }
    /**
     * Writes the arguments as a trace log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    trace(...data) {
        return this.write({ level: LogLevel.TRACE, data, scope: this.scope });
    }
    /**
     * Writes the arguments as a warning log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    warn(...data) {
        return this.write({ level: LogLevel.WARN, data, scope: this.scope });
    }
    /**
     * Writes the log entry.
     * @param entry Log entry to write.
     * @returns This instance for chaining.
     */
    write(entry) {
        if (entry.level <= this.level) {
            this.options.targets.forEach((t) => t.write(entry));
        }
        return this;
    }
}

/**
 * Determines whether the specified {@link value} is a {@link RawMessageResponse}.
 * @param value Value.
 * @returns `true` when the value of a {@link RawMessageResponse}; otherwise `false`.
 */
function isRequest(value) {
    return isMessage(value, "request") && has(value, "unidirectional", "boolean");
}
/**
 * Determines whether the specified {@link value} is a {@link RawMessageResponse}.
 * @param value Value.
 * @returns `true` when the value of a {@link RawMessageResponse; otherwise `false`.
 */
function isResponse(value) {
    return isMessage(value, "response") && has(value, "status", "number");
}
/**
 * Determines whether the specified {@link value} is a message of type {@link type}.
 * @param value Value.
 * @param type Message type.
 * @returns `true` when the value of a {@link Message} of type {@link type}; otherwise `false`.
 */
function isMessage(value, type) {
    // The value should be an object.
    if (value === undefined || value === null || typeof value !== "object") {
        return false;
    }
    // The value should have a __type property of "response".
    if (!("__type" in value) || value.__type !== type) {
        return false;
    }
    // The value should should have at least an id, status, and path1.
    return has(value, "id", "string") && has(value, "path", "string");
}
/**
 * Determines whether the specified {@link key} exists in {@link obj}, and is typeof {@link type}.
 * @param obj Object to check.
 * @param key key to check for.
 * @param type Expected type.
 * @returns `true` when the {@link key} exists in the {@link obj}, and is typeof {@link type}.
 */
function has(obj, key, type) {
    return key in obj && typeof obj[key] === type;
}

/**
 * Message responder responsible for responding to a request.
 */
class MessageResponder {
    request;
    proxy;
    /**
     * Indicates whether a response has already been sent in relation to the response.
     */
    _responded = false;
    /**
     * Initializes a new instance of the {@link MessageResponder} class.
     * @param request The request the response is associated with.
     * @param proxy Proxy responsible for forwarding the response to the client.
     */
    constructor(request, proxy) {
        this.request = request;
        this.proxy = proxy;
    }
    /**
     * Indicates whether a response can be sent.
     * @returns `true` when a response has not yet been set.
     */
    get canRespond() {
        return !this._responded;
    }
    /**
     * Sends a failure response with a status code of `500`.
     * @param body Optional response body.
     * @returns Promise fulfilled once the response has been sent.
     */
    fail(body) {
        return this.send(500, body);
    }
    /**
     * Sends the {@link body} as a response with the {@link status}
     * @param status Response status.
     * @param body Optional response body.
     * @returns Promise fulfilled once the response has been sent.
     */
    async send(status, body) {
        if (this.canRespond) {
            await this.proxy({
                __type: "response",
                id: this.request.id,
                path: this.request.path,
                body,
                status,
            });
            this._responded = true;
        }
    }
    /**
     * Sends a success response with a status code of `200`.
     * @param body Optional response body.
     * @returns Promise fulfilled once the response has been sent.
     */
    success(body) {
        return this.send(200, body);
    }
}

/**
 * Default request timeout.
 */
const DEFAULT_TIMEOUT = 5000;
const PUBLIC_PATH_PREFIX = "public:";
const INTERNAL_PATH_PREFIX = "internal:";
/**
 * Message gateway responsible for sending, routing, and receiving requests and responses.
 */
class MessageGateway extends EventEmitter {
    proxy;
    actionProvider;
    /**
     * Requests with pending responses.
     */
    requests = new Map();
    /**
     * Registered routes, and their respective handlers.
     */
    routes = new EventEmitter();
    /**
     * Initializes a new instance of the {@link MessageGateway} class.
     * @param proxy Proxy capable of sending messages to the plugin / property inspector.
     * @param actionProvider Action provider responsible for retrieving actions associated with source messages.
     */
    constructor(proxy, actionProvider) {
        super();
        this.proxy = proxy;
        this.actionProvider = actionProvider;
    }
    /**
     * Sends the {@link requestOrPath} to the server; the server should be listening on {@link MessageGateway.route}.
     * @param requestOrPath The request, or the path of the request.
     * @param bodyOrUndefined Request body, or moot when constructing the request with {@link MessageRequestOptions}.
     * @returns The response.
     */
    async fetch(requestOrPath, bodyOrUndefined) {
        const id = crypto.randomUUID();
        const { body, path, timeout = DEFAULT_TIMEOUT, unidirectional = false, } = typeof requestOrPath === "string" ? { body: bodyOrUndefined, path: requestOrPath } : requestOrPath;
        // Initialize the response handler.
        const response = new Promise((resolve) => {
            this.requests.set(id, (res) => {
                if (res.status !== 408) {
                    clearTimeout(timeoutMonitor);
                }
                resolve(res);
            });
        });
        // Start the timeout, and send the request.
        const timeoutMonitor = setTimeout(() => this.handleResponse({ __type: "response", id, path, status: 408 }), timeout);
        const accepted = await this.proxy({
            __type: "request",
            body,
            id,
            path,
            unidirectional,
        });
        // When the server did not accept the request, return a 406.
        if (!accepted) {
            this.handleResponse({ __type: "response", id, path, status: 406 });
        }
        return response;
    }
    /**
     * Attempts to process the specified {@link message}.
     * @param message Message to process.
     * @returns `true` when the {@link message} was processed by this instance; otherwise `false`.
     */
    async process(message) {
        if (isRequest(message.payload)) {
            // Server-side handling.
            const action = this.actionProvider(message);
            if (await this.handleRequest(action, message.payload)) {
                return;
            }
            this.emit("unhandledRequest", message);
        }
        else if (isResponse(message.payload) && this.handleResponse(message.payload)) {
            // Response handled successfully.
            return;
        }
        this.emit("unhandledMessage", message);
    }
    /**
     * Maps the specified {@link path} to the {@link handler}, allowing for requests from the client.
     * @param path Path used to identify the route.
     * @param handler Handler to be invoked when the request is received.
     * @param options Optional routing configuration.
     * @returns Disposable capable of removing the route handler.
     */
    route(path, handler, options) {
        options = { filter: () => true, ...options };
        return this.routes.disposableOn(path, async (ev) => {
            if (options?.filter && options.filter(ev.request.action)) {
                await ev.routed();
                try {
                    // Invoke the handler; when data was returned, propagate it as part of the response (if there wasn't already a response).
                    const result = await handler(ev.request, ev.responder);
                    if (result !== undefined) {
                        await ev.responder.send(200, result);
                    }
                }
                catch (err) {
                    // Respond with an error before throwing.
                    await ev.responder.send(500);
                    throw err;
                }
            }
        });
    }
    /**
     * Handles inbound requests.
     * @param action Action associated with the request.
     * @param source The request.
     * @returns `true` when the request was handled; otherwise `false`.
     */
    async handleRequest(action, source) {
        const responder = new MessageResponder(source, this.proxy);
        const request = {
            action,
            path: source.path,
            unidirectional: source.unidirectional,
            body: source.body,
        };
        // Get handlers of the path, and invoke them; filtering is applied by the handlers themselves
        let routed = false;
        const routes = this.routes.listeners(source.path);
        for (const route of routes) {
            await route({
                request,
                responder,
                routed: async () => {
                    // Flags the path as handled, sending an immediate 202 if the request was unidirectional.
                    if (request.unidirectional) {
                        await responder.send(202);
                    }
                    routed = true;
                },
            });
        }
        // The request was successfully routed, so fallback to a 200.
        if (routed) {
            await responder.send(200);
            return true;
        }
        // When there were no applicable routes, return not-handled.
        await responder.send(501);
        return false;
    }
    /**
     * Handles inbound response.
     * @param res The response.
     * @returns `true` when the response was handled; otherwise `false`.
     */
    handleResponse(res) {
        const handler = this.requests.get(res.id);
        this.requests.delete(res.id);
        // Determine if there is a request pending a response.
        if (handler) {
            handler(new MessageResponse(res));
            return true;
        }
        return false;
    }
}
/**
 * Message response, received from the server.
 */
class MessageResponse {
    /**
     * Body of the response.
     */
    body;
    /**
     * Status of the response.
     * - `200` the request was successful.
     * - `202` the request was unidirectional, and does not have a response.
     * - `406` the request could not be accepted by the server.
     * - `408` the request timed-out.
     * - `500` the request failed.
     * - `501` the request is not implemented by the server, and could not be fulfilled.
     */
    status;
    /**
     * Initializes a new instance of the {@link MessageResponse} class.
     * @param res The status code, or the response.
     */
    constructor(res) {
        this.body = res.body;
        this.status = res.status;
    }
    /**
     * Indicates whether the request was successful.
     * @returns `true` when the status indicates a success; otherwise `false`.
     */
    get ok() {
        return this.status >= 200 && this.status < 300;
    }
}

const LOGGER_WRITE_PATH = `${INTERNAL_PATH_PREFIX}logger.write`;
/**
 * Creates a log target that that sends the log entry to the router.
 * @param router Router to which log entries should be sent to.
 * @returns The log target, attached to the router.
 */
function createRoutedLogTarget(router) {
    const format = stringFormatter();
    return {
        write: (entry) => {
            router.fetch({
                body: {
                    level: entry.level,
                    message: format(entry),
                    scope: entry.scope,
                },
                path: LOGGER_WRITE_PATH,
                unidirectional: true,
            });
        },
    };
}

/**
 * Gets the global settings associated with the plugin. Use in conjunction with {@link setGlobalSettings}.
 * @template T The type of global settings associated with the plugin.
 * @returns Promise containing the plugin's global settings.
 */
async function getGlobalSettings() {
    const { uuid } = await connection.getInfo();
    return new Promise((resolve) => {
        connection.once("didReceiveGlobalSettings", (ev) => resolve(ev.payload.settings));
        connection.send({
            event: "getGlobalSettings",
            context: uuid,
        });
    });
}
/**
 * Gets the settings for the action associated with the UI.
 * @template T The type of settings associated with the action.
 * @returns Promise containing the action instance's settings.
 */
async function getSettings() {
    const { uuid, actionInfo: { action }, } = await connection.getInfo();
    return new Promise((resolve) => {
        connection.once("didReceiveSettings", (ev) => resolve(ev.payload.settings));
        connection.send({
            event: "getSettings",
            action,
            context: uuid,
        });
    });
}
/**
 * Occurs when the global settings are requested, or when the the global settings were updated by the plugin.
 * @template T The type of settings associated with the action.
 * @param listener Function to be invoked when the event occurs.
 * @returns A disposable that, when disposed, removes the listener.
 */
function onDidReceiveGlobalSettings(listener) {
    return connection.disposableOn("didReceiveGlobalSettings", (ev) => listener({
        settings: ev.payload.settings,
        type: ev.event,
    }));
}
/**
 * Occurs when the settings associated with an action instance are requested, or when the the settings were updated by the plugin.
 * @template T The type of settings associated with the action.
 * @param listener Function to be invoked when the event occurs.
 * @returns A disposable that, when disposed, removes the listener.
 */
function onDidReceiveSettings(listener) {
    return connection.disposableOn("didReceiveSettings", (ev) => listener({
        action: {
            id: ev.context,
            manifestId: ev.action,
            getSettings,
            setSettings,
        },
        payload: ev.payload,
        type: ev.event,
    }));
}
/**
 * Sets the global {@link settings} associated the plugin. **Note**, these settings are only available to this plugin, and should be used to persist information securely. Use in
 * conjunction with {@link getGlobalSettings}.
 * @param settings Settings to save.
 * @returns `Promise` resolved when the global `settings` are sent to Stream Deck.
 * @example
 * streamDeck.settings.setGlobalSettings({
 *   apiKey,
 *   connectedDate: new Date()
 * })
 */
async function setGlobalSettings(settings) {
    const { uuid } = await connection.getInfo();
    return connection.send({
        event: "setGlobalSettings",
        context: uuid,
        payload: settings,
    });
}
/**
 * Sets the settings for the action associated with the UI.
 * @param settings Settings to persist.
 * @returns `Promise` resolved when the {@link settings} are sent to Stream Deck.
 */
async function setSettings(settings) {
    const { uuid, actionInfo: { action }, } = await connection.getInfo();
    return connection.send({
        event: "setSettings",
        action,
        context: uuid,
        payload: settings,
    });
}

var settings = /*#__PURE__*/Object.freeze({
    __proto__: null,
    getGlobalSettings: getGlobalSettings,
    getSettings: getSettings,
    onDidReceiveGlobalSettings: onDidReceiveGlobalSettings,
    onDidReceiveSettings: onDidReceiveSettings,
    setGlobalSettings: setGlobalSettings,
    setSettings: setSettings
});

/**
 * Router responsible for communicating with the plugin.
 */
const router = new MessageGateway(async (payload) => {
    await sendPayload(payload);
    return true;
}, ({ context: id, action: manifestId }) => ({ id, manifestId, getSettings, setSettings }));
connection.on("sendToPropertyInspector", (ev) => router.process(ev));
/**
 * Controller responsible for interacting with the plugin associated with the property inspector.
 */
class PluginController {
    /**
     * Sends a fetch request to the plugin; the plugin can listen for requests by registering routes.
     * @template T The type of the response body.
     * @param requestOrPath The request, or the path of the request.
     * @param bodyOrUndefined Request body, or moot when constructing the request with {@link MessageRequestOptions}.
     * @returns The response.
     */
    async fetch(requestOrPath, bodyOrUndefined) {
        if (typeof requestOrPath === "string") {
            return router.fetch(`${PUBLIC_PATH_PREFIX}${requestOrPath}`, bodyOrUndefined);
        }
        else {
            return router.fetch({
                ...requestOrPath,
                path: `${PUBLIC_PATH_PREFIX}${requestOrPath.path}`,
            });
        }
    }
    /**
     * Occurs when a message was sent to the property inspector _from_ the plugin. The property inspector can also send messages _to_ the plugin using {@link PluginController.sendToPlugin}.
     * @template TPayload The type of the payload received from the property inspector.
     * @template TSettings The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onSendToPropertyInspector(listener) {
        return router.disposableOn("unhandledMessage", (ev) => {
            listener({
                action: {
                    id: ev.context,
                    manifestId: ev.action,
                    getSettings,
                    setSettings,
                },
                payload: ev.payload,
                type: "sendToPropertyInspector",
            });
        });
    }
    /**
     * Registers the function as a route, exposing it to the plugin via `streamDeck.ui.current.fetch(path)`.
     * @template TBody The type of the request body.
     * @template TSettings The type of the action's settings.
     * @param path Path that identifies the route.
     * @param handler Handler to be invoked when a matching request is received.
     * @param options Optional routing configuration.
     * @returns Disposable capable of removing the route handler.
     * @example
     * streamDeck.plugin.registerRoute("/set-text", async (req, res) => {
     *   // Set the value of the text field in the property inspector.
     *   document.querySelector("#text-field").value = req.body.value;
     * });
     */
    registerRoute(path, handler, options) {
        return router.route(`${PUBLIC_PATH_PREFIX}${path}`, handler, options);
    }
    /**
     * Sends a payload to the plugin.
     * @param payload Payload to send.
     * @returns Promise completed when the message was sent.
     */
    async sendToPlugin(payload) {
        return sendPayload(payload);
    }
}
/**
 * Sends a payload to the plugin.
 * @param payload Payload to send.
 * @returns Promise completed when the message was sent.
 */
async function sendPayload(payload) {
    const { uuid, actionInfo: { action }, } = await connection.getInfo();
    return connection.send({
        event: "sendToPlugin",
        action,
        context: uuid,
        payload,
    });
}
const plugin = new PluginController();

/**
 * Logger responsible for capturing log messages.
 */
const logger = new Logger({
    level: LogLevel.DEBUG,
    targets: [new ConsoleTarget(), createRoutedLogTarget(router)],
});

const __cwd = cwd();
/**
 * Internalization provider, responsible for managing localizations and translating resources.
 */
const i18n = new I18nProvider((window.navigator.language ? window.navigator.language.split("-")[0] : "en"), xmlHttpRequestLocaleProviderSync);
/**
 * Loads a locale from the file system using `fetch`.
 * @param language Language to load.
 * @returns Contents of the locale.
 */
function xmlHttpRequestLocaleProviderSync(language) {
    const filePath = `${__cwd}${language}.json`;
    try {
        const req = new XMLHttpRequest();
        req.open("GET", filePath, false);
        req.send();
        return parseLocalizations(req.response);
    }
    catch (err) {
        if (err instanceof DOMException && err.name === "NOT_FOUND_ERR") {
            // Browser consoles will inherently log an error if a resource cannot be found; we should provide
            // a more forgiving warning alongside the error, without cluttering the main log file.
            console.warn(`Missing localization file: ${language}.json`);
        }
        else {
            logger.error(`Failed to load translations from ${filePath}`, err);
        }
        return null;
    }
}
/**
 * Gets the current working directory.
 * @returns The directory.
 */
function cwd() {
    let path = "";
    const segments = window.location.href.split("/");
    for (let i = 0; i < segments.length - 1; i++) {
        path += `${segments[i]}/`;
        if (segments[i].endsWith(".sdPlugin")) {
            break;
        }
    }
    return path;
}

/**
 * Opens the specified `url` in the user's default browser.
 * @param url URL to open.
 * @returns `Promise` resolved when the request to open the `url` has been sent to Stream Deck.
 */
function openUrl(url) {
    return connection.send({
        event: "openUrl",
        payload: {
            url,
        },
    });
}

var system = /*#__PURE__*/Object.freeze({
    __proto__: null,
    openUrl: openUrl
});

const streamDeck$1 = {
    /**
     * Internalization provider, responsible for managing localizations and translating resources.
     */
    i18n,
    /**
     * Logger responsible for capturing log messages.
     */
    logger,
    /**
     * Provides interaction with the plugin.
     */
    plugin,
    /**
     * Provides management of settings associated with the Stream Deck plugin.
     */
    settings,
    /**
     * Provides events and methods for interacting with the system.
     */
    system,
    /**
     * Occurs before the UI has established a connection with Stream Deck.
     * @param listener Event handler function.
     * @returns A disposable that removes the listener when disposed.
     */
    onConnecting: (listener) => {
        return connection.disposableOn("connecting", listener);
    },
    /**
     * Occurs when the UI has established a connection with Stream Deck.
     * @param listener Event handler function.
     * @returns A disposable that removes the listener when disposed.
     */
    onConnected: (listener) => {
        return connection.disposableOn("connected", listener);
    },
};

const streamDeck = streamDeck$1;
const DEFAULT_FILTERS = ["game", "tool", "application"];
const DEFAULT_SETTINGS = {
    filteroptions: DEFAULT_FILTERS,
    customSteamDir: "",
    selectedCustomFilterId: null
};
const state = {
    settings: { ...DEFAULT_SETTINGS },
    globalSettings: { customFilters: [] },
    installedGames: [],
    effectiveSteamDir: "",
    gamesError: "",
    gamesLoading: true,
    searchTerm: "",
    editor: null,
    view: "main"
};
const app = document.getElementById("app");
function normalizeSettings(settings) {
    return {
        filteroptions: Array.isArray(settings?.filteroptions) && settings.filteroptions.length > 0
            ? Array.from(new Set(settings.filteroptions.map((filter) => String(filter).toLowerCase().trim())))
            : [...DEFAULT_FILTERS],
        customSteamDir: typeof settings?.customSteamDir === "string" ? settings.customSteamDir : "",
        lastScrollIndex: typeof settings?.lastScrollIndex === "number" ? settings.lastScrollIndex : 0,
        selectedCustomFilterId: typeof settings?.selectedCustomFilterId === "string"
            ? settings.selectedCustomFilterId
            : null
    };
}
function normalizeGlobalSettings(settings) {
    const customFilters = Array.isArray(settings?.customFilters)
        ? settings.customFilters
            .filter((filter) => {
            return Boolean(filter &&
                typeof filter.id === "string" &&
                typeof filter.name === "string" &&
                Array.isArray(filter.appids));
        })
            .map((filter) => ({
            id: filter.id,
            name: filter.name,
            appids: filter.appids.map((appid) => String(appid)),
            updatedAt: typeof filter.updatedAt === "string" ? filter.updatedAt : new Date(0).toISOString()
        }))
        : [];
    return { customFilters };
}
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}
function hasFilter(id) {
    return Boolean(id && state.globalSettings.customFilters.some((filter) => filter.id === id));
}
function generateFilterId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `filter-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}
function getSortedFilters() {
    return [...state.globalSettings.customFilters].sort((a, b) => a.name.localeCompare(b.name));
}
function getVisibleGames() {
    const search = state.searchTerm.trim().toLowerCase();
    if (!search) {
        return state.installedGames;
    }
    return state.installedGames.filter((game) => {
        return game.name.toLowerCase().includes(search) || game.type.toLowerCase().includes(search);
    });
}
async function refreshInstalledGames() {
    state.gamesLoading = true;
    state.gamesError = "";
    render();
    const response = await streamDeck.plugin.fetch("/steam-games");
    if (!response.ok || !response.body) {
        state.installedGames = [];
        state.effectiveSteamDir = "";
        state.gamesError = "Unable to load installed Steam games.";
        state.gamesLoading = false;
        render();
        return;
    }
    const body = response.body;
    state.installedGames = body.games ?? [];
    state.effectiveSteamDir = body.steamDir ?? "";
    state.gamesError = body.error ?? "";
    state.gamesLoading = false;
    render();
}
async function persistSettings(patch, options) {
    state.settings = normalizeSettings({ ...state.settings, ...patch });
    await streamDeck.settings.setSettings(state.settings);
    render();
    if (options?.refreshGames) {
        await refreshInstalledGames();
    }
}
async function persistGlobalFilters(filters) {
    state.globalSettings = normalizeGlobalSettings({ customFilters: filters });
    await streamDeck.settings.setGlobalSettings(state.globalSettings);
    render();
}
function openNewFilterEditor() {
    state.searchTerm = "";
    state.view = "editor";
    state.editor = {
        id: null,
        name: "",
        selectedAppIds: new Set()
    };
    render();
}
function openEditFilterEditor(filterId) {
    const filter = state.globalSettings.customFilters.find((entry) => entry.id === filterId);
    if (!filter) {
        return;
    }
    state.searchTerm = "";
    state.view = "editor";
    state.editor = {
        id: filter.id,
        name: filter.name,
        selectedAppIds: new Set(filter.appids)
    };
    render();
}
function closeEditor() {
    state.searchTerm = "";
    state.editor = null;
    state.view = "filters";
    render();
}
function openFiltersView() {
    state.view = "filters";
    state.searchTerm = "";
    state.editor = null;
    render();
}
function openMainView() {
    state.view = "main";
    state.searchTerm = "";
    state.editor = null;
    render();
}
async function saveEditor() {
    if (!state.editor) {
        return;
    }
    const name = state.editor.name.trim();
    if (!name) {
        window.alert("Please enter a filter name.");
        return;
    }
    if (state.editor.selectedAppIds.size === 0) {
        window.alert("Please select at least one Steam game.");
        return;
    }
    const filterId = state.editor.id ?? generateFilterId();
    const updatedFilter = {
        id: filterId,
        name,
        appids: Array.from(state.editor.selectedAppIds),
        updatedAt: new Date().toISOString()
    };
    const nextFilters = state.globalSettings.customFilters.filter((filter) => filter.id !== filterId);
    nextFilters.push(updatedFilter);
    await persistGlobalFilters(nextFilters);
    if (!(state.settings.selectedCustomFilterId ?? null)) {
        await persistSettings({ selectedCustomFilterId: filterId });
    }
    closeEditor();
}
async function deleteFilter(filterId) {
    const filter = state.globalSettings.customFilters.find((entry) => entry.id === filterId);
    if (!filter) {
        return;
    }
    if (!window.confirm(`Delete filter "${filter.name}"?`)) {
        return;
    }
    const nextFilters = state.globalSettings.customFilters.filter((entry) => entry.id !== filterId);
    await persistGlobalFilters(nextFilters);
    if ((state.settings.selectedCustomFilterId ?? null) === filterId) {
        await persistSettings({ selectedCustomFilterId: null });
    }
}
function renderFilterCards() {
    const filters = getSortedFilters();
    if (filters.length === 0) {
        return `<div class="muted">No custom filters yet.</div>`;
    }
    return filters.map((filter) => {
        const isActive = (state.settings.selectedCustomFilterId ?? null) === filter.id;
        return `
            <div class="filter-card">
                <div class="row spaced">
                    <strong>${escapeHtml(filter.name)}</strong>
                    ${isActive ? `<span class="pill">Active on this dial</span>` : ""}
                </div>
                <div class="muted">${filter.appids.length} selected games</div>
                <div class="row wrap" style="margin-top:8px;">
                    <button type="button" data-action="edit-filter" data-filter-id="${escapeHtml(filter.id)}">Edit</button>
                    <button type="button" class="danger" data-action="delete-filter" data-filter-id="${escapeHtml(filter.id)}">Delete</button>
                </div>
            </div>
        `;
    }).join("");
}
function renderEditor() {
    if (!state.editor) {
        return "";
    }
    const visibleGames = getVisibleGames();
    const selectedCount = state.editor.selectedAppIds.size;
    return `
        <div class="screen">
            <div class="screen-header">
                <button type="button" data-action="back-to-filters">Back</button>
                <h2 class="screen-title">${state.editor.id ? "Edit filter" : "New filter"}</h2>
            </div>
            <section class="section">
                <div class="muted" style="margin-bottom:6px;">Filter name</div>
                <input id="editor-name" type="text" value="${escapeHtml(state.editor.name)}" placeholder="Favorites, Co-op, Racing..." />
                <div class="compact-note" style="margin-top:8px;">Use appids behind the scenes so renamed games stay linked.</div>
            </section>
            <section class="section">
                <div class="muted" style="margin-bottom:6px;">Search installed games</div>
                <input id="editor-search" type="text" value="${escapeHtml(state.searchTerm)}" placeholder="Search by name or type" />
                <div class="status">${selectedCount} selected game${selectedCount === 1 ? "" : "s"}</div>
                <div class="game-list" style="margin-top:10px;">
                    ${visibleGames.length === 0
        ? `<div class="muted">No games found for this search.</div>`
        : visibleGames.map((game) => `
                                <label class="game-item">
                                    <input type="checkbox" data-action="toggle-game" data-appid="${escapeHtml(game.appid)}" ${state.editor?.selectedAppIds.has(game.appid) ? "checked" : ""} />
                                    <span class="game-name">${escapeHtml(game.name)}</span>
                                    <span class="muted">${escapeHtml(game.type)}</span>
                                </label>
                            `).join("")}
                </div>
            </section>
            <div class="button-row">
                <button type="button" data-action="back-to-filters">Cancel</button>
                <button type="button" class="primary" data-action="save-filter">Save filter</button>
            </div>
        </div>
    `;
}
function renderFiltersView() {
    return `
        <div class="screen">
            <div class="screen-header">
                <button type="button" data-action="back-to-main">Back</button>
                <h2 class="screen-title">Custom filters</h2>
            </div>
            <section class="section">
                <div class="muted">Global filters stay available even if you remove or recreate a dial action.</div>
                <div class="button-row" style="margin-top:10px;">
                    <button type="button" class="primary" data-action="new-filter">New filter</button>
                </div>
            </section>
            <section class="section">
                <div class="muted" style="margin-bottom:6px;">Active custom filter on this dial</div>
                <select id="active-filter">
                    <option value="">None</option>
                    ${getSortedFilters().map((filter) => `
                        <option value="${escapeHtml(filter.id)}" ${((state.settings.selectedCustomFilterId ?? null) === filter.id) ? "selected" : ""}>${escapeHtml(filter.name)}</option>
                    `).join("")}
                </select>
                <div class="filter-list">
                    ${renderFilterCards()}
                </div>
            </section>
        </div>
    `;
}
function render() {
    if (!app) {
        return;
    }
    if (state.view === "editor") {
        app.innerHTML = renderEditor();
        bindEvents();
        return;
    }
    if (state.view === "filters") {
        app.innerHTML = renderFiltersView();
        bindEvents();
        return;
    }
    const selectedFilter = getSortedFilters().find((filter) => filter.id === (state.settings.selectedCustomFilterId ?? null)) ?? null;
    app.innerHTML = `
        <div class="screen">
            <section class="section">
                <h2>Steam library</h2>
                <div class="muted">Set a custom Steam install directory if Steam is not located in the default folder.</div>
                <div style="margin-top:10px;">
                    <input id="steam-dir" type="text" value="${escapeHtml(state.settings.customSteamDir ?? "")}" placeholder="C:/Program Files (x86)/Steam" />
                </div>
                <div class="status ${state.gamesError ? "error" : ""}">
                    ${state.gamesLoading
        ? "Loading installed Steam games..."
        : state.gamesError
            ? escapeHtml(state.gamesError)
            : `${state.installedGames.length} installed games loaded from ${escapeHtml(state.effectiveSteamDir)}`}
                </div>
            </section>
            <section class="section">
                <h2>Base filters</h2>
                <div class="checkbox-grid">
                    ${DEFAULT_FILTERS.map((filter) => `
                        <label class="checkbox">
                            <input type="checkbox" data-action="toggle-base-filter" value="${filter}" ${state.settings.filteroptions.includes(filter) ? "checked" : ""} />
                            <span>${filter === "game" ? "Games" : filter === "tool" ? "Tools" : "Applications"}</span>
                        </label>
                    `).join("")}
                </div>
            </section>
            <section class="section">
                <h2>Custom filter</h2>
                <div class="muted">${selectedFilter ? `Active: ${escapeHtml(selectedFilter.name)}` : "No custom filter selected for this dial."}</div>
                <div class="button-row" style="margin-top:10px;">
                    <button type="button" class="primary" data-action="manage-filters">Manage filters</button>
                </div>
            </section>
        </div>
    `;
    bindEvents();
}
function bindEvents() {
    const steamDirInput = document.getElementById("steam-dir");
    steamDirInput?.addEventListener("change", async () => {
        await persistSettings({ customSteamDir: steamDirInput.value, lastScrollIndex: 0 }, { refreshGames: true });
    });
    document.querySelectorAll('input[data-action="toggle-base-filter"]').forEach((checkbox) => {
        checkbox.addEventListener("change", async () => {
            const checkedFilters = Array.from(document.querySelectorAll('input[data-action="toggle-base-filter"]:checked'))
                .map((input) => input.value);
            await persistSettings({
                filteroptions: checkedFilters.length > 0 ? checkedFilters : [...DEFAULT_FILTERS],
                lastScrollIndex: 0
            });
        });
    });
    const activeFilterSelect = document.getElementById("active-filter");
    activeFilterSelect?.addEventListener("change", async () => {
        await persistSettings({
            selectedCustomFilterId: activeFilterSelect.value || null,
            lastScrollIndex: 0
        });
    });
    document.querySelector('[data-action="manage-filters"]')?.addEventListener("click", openFiltersView);
    document.querySelector('[data-action="back-to-main"]')?.addEventListener("click", openMainView);
    document.querySelectorAll('[data-action="back-to-filters"]').forEach((button) => {
        button.addEventListener("click", closeEditor);
    });
    document.querySelector('[data-action="new-filter"]')?.addEventListener("click", openNewFilterEditor);
    document.querySelectorAll('[data-action="edit-filter"]').forEach((button) => {
        button.addEventListener("click", () => {
            openEditFilterEditor(button.dataset.filterId ?? "");
        });
    });
    document.querySelectorAll('[data-action="delete-filter"]').forEach((button) => {
        button.addEventListener("click", async () => {
            await deleteFilter(button.dataset.filterId ?? "");
        });
    });
    document.querySelector('[data-action="save-filter"]')?.addEventListener("click", async () => {
        await saveEditor();
    });
    const editorName = document.getElementById("editor-name");
    editorName?.addEventListener("input", () => {
        if (!state.editor) {
            return;
        }
        state.editor.name = editorName.value;
    });
    const editorSearch = document.getElementById("editor-search");
    editorSearch?.addEventListener("input", () => {
        state.searchTerm = editorSearch.value;
        render();
    });
    document.querySelectorAll('input[data-action="toggle-game"]').forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            if (!state.editor) {
                return;
            }
            const appId = checkbox.dataset.appid ?? "";
            if (!appId) {
                return;
            }
            if (checkbox.checked) {
                state.editor.selectedAppIds.add(appId);
            }
            else {
                state.editor.selectedAppIds.delete(appId);
            }
            const status = document.querySelector(".status");
            if (status) {
                const selectedCount = state.editor.selectedAppIds.size;
                status.textContent = `${selectedCount} selected game${selectedCount === 1 ? "" : "s"}`;
            }
        });
    });
}
async function initialize() {
    const [settings, globalSettings] = await Promise.all([
        streamDeck.settings.getSettings(),
        streamDeck.settings.getGlobalSettings()
    ]);
    state.settings = normalizeSettings(settings);
    state.globalSettings = normalizeGlobalSettings(globalSettings);
    if (!hasFilter(state.settings.selectedCustomFilterId ?? null)) {
        state.settings.selectedCustomFilterId = null;
        await streamDeck.settings.setSettings(state.settings);
    }
    streamDeck.settings.onDidReceiveSettings((ev) => {
        const previousSteamDir = state.settings.customSteamDir;
        state.settings = normalizeSettings(ev.payload.settings);
        render();
        if (previousSteamDir !== state.settings.customSteamDir) {
            void refreshInstalledGames();
        }
    });
    streamDeck.settings.onDidReceiveGlobalSettings((ev) => {
        state.globalSettings = normalizeGlobalSettings(ev.settings);
        if (!hasFilter(state.settings.selectedCustomFilterId ?? null)) {
            void persistSettings({ selectedCustomFilterId: null });
            return;
        }
        render();
    });
    render();
    await refreshInstalledGames();
}
void initialize();
