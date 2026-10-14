(() => {
  // node_modules/minisearch/dist/es/index.js
  var ENTRIES = "ENTRIES";
  var KEYS = "KEYS";
  var VALUES = "VALUES";
  var LEAF = "";
  var TreeIterator = class {
    constructor(set, type) {
      const node = set._tree;
      const keys = Array.from(node.keys());
      this.set = set;
      this._type = type;
      this._path = keys.length > 0 ? [{ node, keys }] : [];
    }
    next() {
      const value = this.dive();
      this.backtrack();
      return value;
    }
    dive() {
      if (this._path.length === 0) {
        return { done: true, value: void 0 };
      }
      const { node, keys } = last$1(this._path);
      if (last$1(keys) === LEAF) {
        return { done: false, value: this.result() };
      }
      const child = node.get(last$1(keys));
      this._path.push({ node: child, keys: Array.from(child.keys()) });
      return this.dive();
    }
    backtrack() {
      if (this._path.length === 0) {
        return;
      }
      const keys = last$1(this._path).keys;
      keys.pop();
      if (keys.length > 0) {
        return;
      }
      this._path.pop();
      this.backtrack();
    }
    key() {
      return this.set._prefix + this._path.map(({ keys }) => last$1(keys)).filter((key2) => key2 !== LEAF).join("");
    }
    value() {
      return last$1(this._path).node.get(LEAF);
    }
    result() {
      switch (this._type) {
        case VALUES:
          return this.value();
        case KEYS:
          return this.key();
        default:
          return [this.key(), this.value()];
      }
    }
    [Symbol.iterator]() {
      return this;
    }
  };
  var last$1 = (array) => {
    return array[array.length - 1];
  };
  var fuzzySearch = (node, query, maxDistance) => {
    const results = /* @__PURE__ */ new Map();
    if (query === void 0)
      return results;
    const n = query.length + 1;
    const m = n + maxDistance;
    const matrix = new Uint8Array(m * n).fill(maxDistance + 1);
    for (let j = 0; j < n; ++j)
      matrix[j] = j;
    for (let i = 1; i < m; ++i)
      matrix[i * n] = i;
    recurse(node, query, maxDistance, results, matrix, 1, n, "");
    return results;
  };
  var recurse = (node, query, maxDistance, results, matrix, m, n, prefix) => {
    const offset = m * n;
    key: for (const key2 of node.keys()) {
      if (key2 === LEAF) {
        const distance = matrix[offset - 1];
        if (distance <= maxDistance) {
          results.set(prefix, [node.get(key2), distance]);
        }
      } else {
        let i = m;
        for (let pos = 0; pos < key2.length; ++pos, ++i) {
          const char = key2[pos];
          const thisRowOffset = n * i;
          const prevRowOffset = thisRowOffset - n;
          let minDistance = matrix[thisRowOffset];
          const jmin = Math.max(0, i - maxDistance - 1);
          const jmax = Math.min(n - 1, i + maxDistance);
          for (let j = jmin; j < jmax; ++j) {
            const different = char !== query[j];
            const rpl = matrix[prevRowOffset + j] + +different;
            const del = matrix[prevRowOffset + j + 1] + 1;
            const ins = matrix[thisRowOffset + j] + 1;
            const dist = matrix[thisRowOffset + j + 1] = Math.min(rpl, del, ins);
            if (dist < minDistance)
              minDistance = dist;
          }
          if (minDistance > maxDistance) {
            continue key;
          }
        }
        recurse(node.get(key2), query, maxDistance, results, matrix, i, n, prefix + key2);
      }
    }
  };
  var SearchableMap = class _SearchableMap {
    /**
     * The constructor is normally called without arguments, creating an empty
     * map. In order to create a {@link SearchableMap} from an iterable or from an
     * object, check {@link SearchableMap.from} and {@link
     * SearchableMap.fromObject}.
     *
     * The constructor arguments are for internal use, when creating derived
     * mutable views of a map at a prefix.
     */
    constructor(tree = /* @__PURE__ */ new Map(), prefix = "") {
      this._size = void 0;
      this._tree = tree;
      this._prefix = prefix;
    }
    /**
     * Creates and returns a mutable view of this {@link SearchableMap},
     * containing only entries that share the given prefix.
     *
     * ### Usage:
     *
     * ```javascript
     * let map = new SearchableMap()
     * map.set("unicorn", 1)
     * map.set("universe", 2)
     * map.set("university", 3)
     * map.set("unique", 4)
     * map.set("hello", 5)
     *
     * let uni = map.atPrefix("uni")
     * uni.get("unique") // => 4
     * uni.get("unicorn") // => 1
     * uni.get("hello") // => undefined
     *
     * let univer = map.atPrefix("univer")
     * univer.get("unique") // => undefined
     * univer.get("universe") // => 2
     * univer.get("university") // => 3
     * ```
     *
     * @param prefix  The prefix
     * @return A {@link SearchableMap} representing a mutable view of the original
     * Map at the given prefix
     */
    atPrefix(prefix) {
      if (!prefix.startsWith(this._prefix)) {
        throw new Error("Mismatched prefix");
      }
      const [node, path] = trackDown(this._tree, prefix.slice(this._prefix.length));
      if (node === void 0) {
        const [parentNode, key2] = last(path);
        for (const k of parentNode.keys()) {
          if (k !== LEAF && k.startsWith(key2)) {
            const node2 = /* @__PURE__ */ new Map();
            node2.set(k.slice(key2.length), parentNode.get(k));
            return new _SearchableMap(node2, prefix);
          }
        }
      }
      return new _SearchableMap(node, prefix);
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/clear
     */
    clear() {
      this._size = void 0;
      this._tree.clear();
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/delete
     * @param key  Key to delete
     */
    delete(key2) {
      this._size = void 0;
      return remove(this._tree, key2);
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/entries
     * @return An iterator iterating through `[key, value]` entries.
     */
    entries() {
      return new TreeIterator(this, ENTRIES);
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/forEach
     * @param fn  Iteration function
     */
    forEach(fn) {
      for (const [key2, value] of this) {
        fn(key2, value, this);
      }
    }
    /**
     * Returns a Map of all the entries that have a key within the given edit
     * distance from the search key. The keys of the returned Map are the matching
     * keys, while the values are two-element arrays where the first element is
     * the value associated to the key, and the second is the edit distance of the
     * key to the search key.
     *
     * ### Usage:
     *
     * ```javascript
     * let map = new SearchableMap()
     * map.set('hello', 'world')
     * map.set('hell', 'yeah')
     * map.set('ciao', 'mondo')
     *
     * // Get all entries that match the key 'hallo' with a maximum edit distance of 2
     * map.fuzzyGet('hallo', 2)
     * // => Map(2) { 'hello' => ['world', 1], 'hell' => ['yeah', 2] }
     *
     * // In the example, the "hello" key has value "world" and edit distance of 1
     * // (change "e" to "a"), the key "hell" has value "yeah" and edit distance of 2
     * // (change "e" to "a", delete "o")
     * ```
     *
     * @param key  The search key
     * @param maxEditDistance  The maximum edit distance (Levenshtein)
     * @return A Map of the matching keys to their value and edit distance
     */
    fuzzyGet(key2, maxEditDistance) {
      return fuzzySearch(this._tree, key2, maxEditDistance);
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/get
     * @param key  Key to get
     * @return Value associated to the key, or `undefined` if the key is not
     * found.
     */
    get(key2) {
      const node = lookup(this._tree, key2);
      return node !== void 0 ? node.get(LEAF) : void 0;
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/has
     * @param key  Key
     * @return True if the key is in the map, false otherwise
     */
    has(key2) {
      const node = lookup(this._tree, key2);
      return node !== void 0 && node.has(LEAF);
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/keys
     * @return An `Iterable` iterating through keys
     */
    keys() {
      return new TreeIterator(this, KEYS);
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/set
     * @param key  Key to set
     * @param value  Value to associate to the key
     * @return The {@link SearchableMap} itself, to allow chaining
     */
    set(key2, value) {
      if (typeof key2 !== "string") {
        throw new Error("key must be a string");
      }
      this._size = void 0;
      const node = createPath(this._tree, key2);
      node.set(LEAF, value);
      return this;
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/size
     */
    get size() {
      if (this._size) {
        return this._size;
      }
      this._size = 0;
      const iter = this.entries();
      while (!iter.next().done)
        this._size += 1;
      return this._size;
    }
    /**
     * Updates the value at the given key using the provided function. The function
     * is called with the current value at the key, and its return value is used as
     * the new value to be set.
     *
     * ### Example:
     *
     * ```javascript
     * // Increment the current value by one
     * searchableMap.update('somekey', (currentValue) => currentValue == null ? 0 : currentValue + 1)
     * ```
     *
     * If the value at the given key is or will be an object, it might not require
     * re-assignment. In that case it is better to use `fetch()`, because it is
     * faster.
     *
     * @param key  The key to update
     * @param fn  The function used to compute the new value from the current one
     * @return The {@link SearchableMap} itself, to allow chaining
     */
    update(key2, fn) {
      if (typeof key2 !== "string") {
        throw new Error("key must be a string");
      }
      this._size = void 0;
      const node = createPath(this._tree, key2);
      node.set(LEAF, fn(node.get(LEAF)));
      return this;
    }
    /**
     * Fetches the value of the given key. If the value does not exist, calls the
     * given function to create a new value, which is inserted at the given key
     * and subsequently returned.
     *
     * ### Example:
     *
     * ```javascript
     * const map = searchableMap.fetch('somekey', () => new Map())
     * map.set('foo', 'bar')
     * ```
     *
     * @param key  The key to update
     * @param initial  A function that creates a new value if the key does not exist
     * @return The existing or new value at the given key
     */
    fetch(key2, initial) {
      if (typeof key2 !== "string") {
        throw new Error("key must be a string");
      }
      this._size = void 0;
      const node = createPath(this._tree, key2);
      let value = node.get(LEAF);
      if (value === void 0) {
        node.set(LEAF, value = initial());
      }
      return value;
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/values
     * @return An `Iterable` iterating through values.
     */
    values() {
      return new TreeIterator(this, VALUES);
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/@@iterator
     */
    [Symbol.iterator]() {
      return this.entries();
    }
    /**
     * Creates a {@link SearchableMap} from an `Iterable` of entries
     *
     * @param entries  Entries to be inserted in the {@link SearchableMap}
     * @return A new {@link SearchableMap} with the given entries
     */
    static from(entries) {
      const tree = new _SearchableMap();
      for (const [key2, value] of entries) {
        tree.set(key2, value);
      }
      return tree;
    }
    /**
     * Creates a {@link SearchableMap} from the iterable properties of a JavaScript object
     *
     * @param object  Object of entries for the {@link SearchableMap}
     * @return A new {@link SearchableMap} with the given entries
     */
    static fromObject(object) {
      return _SearchableMap.from(Object.entries(object));
    }
  };
  var trackDown = (tree, key2, path = []) => {
    if (key2.length === 0 || tree == null) {
      return [tree, path];
    }
    for (const k of tree.keys()) {
      if (k !== LEAF && key2.startsWith(k)) {
        path.push([tree, k]);
        return trackDown(tree.get(k), key2.slice(k.length), path);
      }
    }
    path.push([tree, key2]);
    return trackDown(void 0, "", path);
  };
  var lookup = (tree, key2) => {
    if (key2.length === 0 || tree == null) {
      return tree;
    }
    for (const k of tree.keys()) {
      if (k !== LEAF && key2.startsWith(k)) {
        return lookup(tree.get(k), key2.slice(k.length));
      }
    }
  };
  var createPath = (node, key2) => {
    const keyLength = key2.length;
    outer: for (let pos = 0; node && pos < keyLength; ) {
      for (const k of node.keys()) {
        if (k !== LEAF && key2[pos] === k[0]) {
          const len = Math.min(keyLength - pos, k.length);
          let offset = 1;
          while (offset < len && key2[pos + offset] === k[offset])
            ++offset;
          const child2 = node.get(k);
          if (offset === k.length) {
            node = child2;
          } else {
            const intermediate = /* @__PURE__ */ new Map();
            intermediate.set(k.slice(offset), child2);
            node.set(key2.slice(pos, pos + offset), intermediate);
            node.delete(k);
            node = intermediate;
          }
          pos += offset;
          continue outer;
        }
      }
      const child = /* @__PURE__ */ new Map();
      node.set(key2.slice(pos), child);
      return child;
    }
    return node;
  };
  var remove = (tree, key2) => {
    const [node, path] = trackDown(tree, key2);
    if (node === void 0) {
      return;
    }
    node.delete(LEAF);
    if (node.size === 0) {
      cleanup(path);
    } else if (node.size === 1) {
      const [key3, value] = node.entries().next().value;
      merge(path, key3, value);
    }
  };
  var cleanup = (path) => {
    if (path.length === 0) {
      return;
    }
    const [node, key2] = last(path);
    node.delete(key2);
    if (node.size === 0) {
      cleanup(path.slice(0, -1));
    } else if (node.size === 1) {
      const [key3, value] = node.entries().next().value;
      if (key3 !== LEAF) {
        merge(path.slice(0, -1), key3, value);
      }
    }
  };
  var merge = (path, key2, value) => {
    if (path.length === 0) {
      return;
    }
    const [node, nodeKey] = last(path);
    node.set(nodeKey + key2, value);
    node.delete(nodeKey);
  };
  var last = (array) => {
    return array[array.length - 1];
  };
  var OR = "or";
  var AND = "and";
  var AND_NOT = "and_not";
  var MiniSearch = class _MiniSearch {
    /**
     * @param options  Configuration options
     *
     * ### Examples:
     *
     * ```javascript
     * // Create a search engine that indexes the 'title' and 'text' fields of your
     * // documents:
     * const miniSearch = new MiniSearch({ fields: ['title', 'text'] })
     * ```
     *
     * ### ID Field:
     *
     * ```javascript
     * // Your documents are assumed to include a unique 'id' field, but if you want
     * // to use a different field for document identification, you can set the
     * // 'idField' option:
     * const miniSearch = new MiniSearch({ idField: 'key', fields: ['title', 'text'] })
     * ```
     *
     * ### Options and defaults:
     *
     * ```javascript
     * // The full set of options (here with their default value) is:
     * const miniSearch = new MiniSearch({
     *   // idField: field that uniquely identifies a document
     *   idField: 'id',
     *
     *   // extractField: function used to get the value of a field in a document.
     *   // By default, it assumes the document is a flat object with field names as
     *   // property keys and field values as string property values, but custom logic
     *   // can be implemented by setting this option to a custom extractor function.
     *   extractField: (document, fieldName) => document[fieldName],
     *
     *   // tokenize: function used to split fields into individual terms. By
     *   // default, it is also used to tokenize search queries, unless a specific
     *   // `tokenize` search option is supplied. When tokenizing an indexed field,
     *   // the field name is passed as the second argument.
     *   tokenize: (string, _fieldName) => string.split(SPACE_OR_PUNCTUATION),
     *
     *   // processTerm: function used to process each tokenized term before
     *   // indexing. It can be used for stemming and normalization. Return a falsy
     *   // value in order to discard a term. By default, it is also used to process
     *   // search queries, unless a specific `processTerm` option is supplied as a
     *   // search option. When processing a term from a indexed field, the field
     *   // name is passed as the second argument.
     *   processTerm: (term, _fieldName) => term.toLowerCase(),
     *
     *   // searchOptions: default search options, see the `search` method for
     *   // details
     *   searchOptions: undefined,
     *
     *   // fields: document fields to be indexed. Mandatory, but not set by default
     *   fields: undefined
     *
     *   // storeFields: document fields to be stored and returned as part of the
     *   // search results.
     *   storeFields: []
     * })
     * ```
     */
    constructor(options) {
      if ((options === null || options === void 0 ? void 0 : options.fields) == null) {
        throw new Error('MiniSearch: option "fields" must be provided');
      }
      const autoVacuum = options.autoVacuum == null || options.autoVacuum === true ? defaultAutoVacuumOptions : options.autoVacuum;
      this._options = {
        ...defaultOptions,
        ...options,
        autoVacuum,
        searchOptions: { ...defaultSearchOptions, ...options.searchOptions || {} },
        autoSuggestOptions: { ...defaultAutoSuggestOptions, ...options.autoSuggestOptions || {} }
      };
      this._index = new SearchableMap();
      this._documentCount = 0;
      this._documentIds = /* @__PURE__ */ new Map();
      this._idToShortId = /* @__PURE__ */ new Map();
      this._fieldIds = {};
      this._fieldLength = /* @__PURE__ */ new Map();
      this._avgFieldLength = [];
      this._nextId = 0;
      this._storedFields = /* @__PURE__ */ new Map();
      this._dirtCount = 0;
      this._currentVacuum = null;
      this._enqueuedVacuum = null;
      this._enqueuedVacuumConditions = defaultVacuumConditions;
      this.addFields(this._options.fields);
    }
    /**
     * Adds a document to the index
     *
     * @param document  The document to be indexed
     */
    add(document2) {
      const { extractField, stringifyField, tokenize, processTerm, fields, idField } = this._options;
      const id = extractField(document2, idField);
      if (id == null) {
        throw new Error(`MiniSearch: document does not have ID field "${idField}"`);
      }
      if (this._idToShortId.has(id)) {
        throw new Error(`MiniSearch: duplicate ID ${id}`);
      }
      const shortDocumentId = this.addDocumentId(id);
      this.saveStoredFields(shortDocumentId, document2);
      for (const field2 of fields) {
        const fieldValue = extractField(document2, field2);
        if (fieldValue == null)
          continue;
        const tokens = tokenize(stringifyField(fieldValue, field2), field2);
        const fieldId = this._fieldIds[field2];
        const uniqueTerms = new Set(tokens).size;
        this.addFieldLength(shortDocumentId, fieldId, this._documentCount - 1, uniqueTerms);
        for (const term of tokens) {
          const processedTerm = processTerm(term, field2);
          if (Array.isArray(processedTerm)) {
            for (const t of processedTerm) {
              this.addTerm(fieldId, shortDocumentId, t);
            }
          } else if (processedTerm) {
            this.addTerm(fieldId, shortDocumentId, processedTerm);
          }
        }
      }
    }
    /**
     * Adds all the given documents to the index
     *
     * @param documents  An array of documents to be indexed
     */
    addAll(documents) {
      for (const document2 of documents)
        this.add(document2);
    }
    /**
     * Adds all the given documents to the index asynchronously.
     *
     * Returns a promise that resolves (to `undefined`) when the indexing is done.
     * This method is useful when index many documents, to avoid blocking the main
     * thread. The indexing is performed asynchronously and in chunks.
     *
     * @param documents  An array of documents to be indexed
     * @param options  Configuration options
     * @return A promise resolving to `undefined` when the indexing is done
     */
    addAllAsync(documents, options = {}) {
      const { chunkSize = 10 } = options;
      const acc = { chunk: [], promise: Promise.resolve() };
      const { chunk, promise } = documents.reduce(({ chunk: chunk2, promise: promise2 }, document2, i) => {
        chunk2.push(document2);
        if ((i + 1) % chunkSize === 0) {
          return {
            chunk: [],
            promise: promise2.then(() => new Promise((resolve) => setTimeout(resolve, 0))).then(() => this.addAll(chunk2))
          };
        } else {
          return { chunk: chunk2, promise: promise2 };
        }
      }, acc);
      return promise.then(() => this.addAll(chunk));
    }
    /**
     * Removes the given document from the index.
     *
     * The document to remove must NOT have changed between indexing and removal,
     * otherwise the index will be corrupted.
     *
     * This method requires passing the full document to be removed (not just the
     * ID), and immediately removes the document from the inverted index, allowing
     * memory to be released. A convenient alternative is {@link
     * MiniSearch#discard}, which needs only the document ID, and has the same
     * visible effect, but delays cleaning up the index until the next vacuuming.
     *
     * @param document  The document to be removed
     */
    remove(document2) {
      const { tokenize, processTerm, extractField, stringifyField, fields, idField } = this._options;
      const id = extractField(document2, idField);
      if (id == null) {
        throw new Error(`MiniSearch: document does not have ID field "${idField}"`);
      }
      const shortId = this._idToShortId.get(id);
      if (shortId == null) {
        throw new Error(`MiniSearch: cannot remove document with ID ${id}: it is not in the index`);
      }
      for (const field2 of fields) {
        const fieldValue = extractField(document2, field2);
        if (fieldValue == null)
          continue;
        const tokens = tokenize(stringifyField(fieldValue, field2), field2);
        const fieldId = this._fieldIds[field2];
        const uniqueTerms = new Set(tokens).size;
        this.removeFieldLength(shortId, fieldId, this._documentCount, uniqueTerms);
        for (const term of tokens) {
          const processedTerm = processTerm(term, field2);
          if (Array.isArray(processedTerm)) {
            for (const t of processedTerm) {
              this.removeTerm(fieldId, shortId, t);
            }
          } else if (processedTerm) {
            this.removeTerm(fieldId, shortId, processedTerm);
          }
        }
      }
      this._storedFields.delete(shortId);
      this._documentIds.delete(shortId);
      this._idToShortId.delete(id);
      this._fieldLength.delete(shortId);
      this._documentCount -= 1;
    }
    /**
     * Removes all the given documents from the index. If called with no arguments,
     * it removes _all_ documents from the index.
     *
     * @param documents  The documents to be removed. If this argument is omitted,
     * all documents are removed. Note that, for removing all documents, it is
     * more efficient to call this method with no arguments than to pass all
     * documents.
     */
    removeAll(documents) {
      if (documents) {
        for (const document2 of documents)
          this.remove(document2);
      } else if (arguments.length > 0) {
        throw new Error("Expected documents to be present. Omit the argument to remove all documents.");
      } else {
        this._index = new SearchableMap();
        this._documentCount = 0;
        this._documentIds = /* @__PURE__ */ new Map();
        this._idToShortId = /* @__PURE__ */ new Map();
        this._fieldLength = /* @__PURE__ */ new Map();
        this._avgFieldLength = [];
        this._storedFields = /* @__PURE__ */ new Map();
        this._nextId = 0;
      }
    }
    /**
     * Discards the document with the given ID, so it won't appear in search results
     *
     * It has the same visible effect of {@link MiniSearch.remove} (both cause the
     * document to stop appearing in searches), but a different effect on the
     * internal data structures:
     *
     *   - {@link MiniSearch#remove} requires passing the full document to be
     *   removed as argument, and removes it from the inverted index immediately.
     *
     *   - {@link MiniSearch#discard} instead only needs the document ID, and
     *   works by marking the current version of the document as discarded, so it
     *   is immediately ignored by searches. This is faster and more convenient
     *   than {@link MiniSearch#remove}, but the index is not immediately
     *   modified. To take care of that, vacuuming is performed after a certain
     *   number of documents are discarded, cleaning up the index and allowing
     *   memory to be released.
     *
     * After discarding a document, it is possible to re-add a new version, and
     * only the new version will appear in searches. In other words, discarding
     * and re-adding a document works exactly like removing and re-adding it. The
     * {@link MiniSearch.replace} method can also be used to replace a document
     * with a new version.
     *
     * #### Details about vacuuming
     *
     * Repetite calls to this method would leave obsolete document references in
     * the index, invisible to searches. Two mechanisms take care of cleaning up:
     * clean up during search, and vacuuming.
     *
     *   - Upon search, whenever a discarded ID is found (and ignored for the
     *   results), references to the discarded document are removed from the
     *   inverted index entries for the search terms. This ensures that subsequent
     *   searches for the same terms do not need to skip these obsolete references
     *   again.
     *
     *   - In addition, vacuuming is performed automatically by default (see the
     *   `autoVacuum` field in {@link Options}) after a certain number of
     *   documents are discarded. Vacuuming traverses all terms in the index,
     *   cleaning up all references to discarded documents. Vacuuming can also be
     *   triggered manually by calling {@link MiniSearch#vacuum}.
     *
     * @param id  The ID of the document to be discarded
     */
    discard(id) {
      const shortId = this._idToShortId.get(id);
      if (shortId == null) {
        throw new Error(`MiniSearch: cannot discard document with ID ${id}: it is not in the index`);
      }
      this._idToShortId.delete(id);
      this._documentIds.delete(shortId);
      this._storedFields.delete(shortId);
      (this._fieldLength.get(shortId) || []).forEach((fieldLength, fieldId) => {
        this.removeFieldLength(shortId, fieldId, this._documentCount, fieldLength);
      });
      this._fieldLength.delete(shortId);
      this._documentCount -= 1;
      this._dirtCount += 1;
      this.maybeAutoVacuum();
    }
    maybeAutoVacuum() {
      if (this._options.autoVacuum === false) {
        return;
      }
      const { minDirtFactor, minDirtCount, batchSize, batchWait } = this._options.autoVacuum;
      this.conditionalVacuum({ batchSize, batchWait }, { minDirtCount, minDirtFactor });
    }
    /**
     * Discards the documents with the given IDs, so they won't appear in search
     * results
     *
     * It is equivalent to calling {@link MiniSearch#discard} for all the given
     * IDs, but with the optimization of triggering at most one automatic
     * vacuuming at the end.
     *
     * Note: to remove all documents from the index, it is faster and more
     * convenient to call {@link MiniSearch.removeAll} with no argument, instead
     * of passing all IDs to this method.
     */
    discardAll(ids) {
      const autoVacuum = this._options.autoVacuum;
      try {
        this._options.autoVacuum = false;
        for (const id of ids) {
          this.discard(id);
        }
      } finally {
        this._options.autoVacuum = autoVacuum;
      }
      this.maybeAutoVacuum();
    }
    /**
     * It replaces an existing document with the given updated version
     *
     * It works by discarding the current version and adding the updated one, so
     * it is functionally equivalent to calling {@link MiniSearch#discard}
     * followed by {@link MiniSearch#add}. The ID of the updated document should
     * be the same as the original one.
     *
     * Since it uses {@link MiniSearch#discard} internally, this method relies on
     * vacuuming to clean up obsolete document references from the index, allowing
     * memory to be released (see {@link MiniSearch#discard}).
     *
     * @param updatedDocument  The updated document to replace the old version
     * with
     */
    replace(updatedDocument) {
      const { idField, extractField } = this._options;
      const id = extractField(updatedDocument, idField);
      this.discard(id);
      this.add(updatedDocument);
    }
    /**
     * Triggers a manual vacuuming, cleaning up references to discarded documents
     * from the inverted index
     *
     * Vacuuming is only useful for applications that use the {@link
     * MiniSearch#discard} or {@link MiniSearch#replace} methods.
     *
     * By default, vacuuming is performed automatically when needed (controlled by
     * the `autoVacuum` field in {@link Options}), so there is usually no need to
     * call this method, unless one wants to make sure to perform vacuuming at a
     * specific moment.
     *
     * Vacuuming traverses all terms in the inverted index in batches, and cleans
     * up references to discarded documents from the posting list, allowing memory
     * to be released.
     *
     * The method takes an optional object as argument with the following keys:
     *
     *   - `batchSize`: the size of each batch (1000 by default)
     *
     *   - `batchWait`: the number of milliseconds to wait between batches (10 by
     *   default)
     *
     * On large indexes, vacuuming could have a non-negligible cost: batching
     * avoids blocking the thread for long, diluting this cost so that it is not
     * negatively affecting the application. Nonetheless, this method should only
     * be called when necessary, and relying on automatic vacuuming is usually
     * better.
     *
     * It returns a promise that resolves (to undefined) when the clean up is
     * completed. If vacuuming is already ongoing at the time this method is
     * called, a new one is enqueued immediately after the ongoing one, and a
     * corresponding promise is returned. However, no more than one vacuuming is
     * enqueued on top of the ongoing one, even if this method is called more
     * times (enqueuing multiple ones would be useless).
     *
     * @param options  Configuration options for the batch size and delay. See
     * {@link VacuumOptions}.
     */
    vacuum(options = {}) {
      return this.conditionalVacuum(options);
    }
    conditionalVacuum(options, conditions) {
      if (this._currentVacuum) {
        this._enqueuedVacuumConditions = this._enqueuedVacuumConditions && conditions;
        if (this._enqueuedVacuum != null) {
          return this._enqueuedVacuum;
        }
        this._enqueuedVacuum = this._currentVacuum.then(() => {
          const conditions2 = this._enqueuedVacuumConditions;
          this._enqueuedVacuumConditions = defaultVacuumConditions;
          return this.performVacuuming(options, conditions2);
        });
        return this._enqueuedVacuum;
      }
      if (this.vacuumConditionsMet(conditions) === false) {
        return Promise.resolve();
      }
      this._currentVacuum = this.performVacuuming(options);
      return this._currentVacuum;
    }
    async performVacuuming(options, conditions) {
      const initialDirtCount = this._dirtCount;
      if (this.vacuumConditionsMet(conditions)) {
        const batchSize = options.batchSize || defaultVacuumOptions.batchSize;
        const batchWait = options.batchWait || defaultVacuumOptions.batchWait;
        let i = 1;
        for (const [term, fieldsData] of this._index) {
          for (const [fieldId, fieldIndex] of fieldsData) {
            for (const [shortId] of fieldIndex) {
              if (this._documentIds.has(shortId)) {
                continue;
              }
              if (fieldIndex.size <= 1) {
                fieldsData.delete(fieldId);
              } else {
                fieldIndex.delete(shortId);
              }
            }
          }
          if (this._index.get(term).size === 0) {
            this._index.delete(term);
          }
          if (i % batchSize === 0) {
            await new Promise((resolve) => setTimeout(resolve, batchWait));
          }
          i += 1;
        }
        this._dirtCount -= initialDirtCount;
      }
      await null;
      this._currentVacuum = this._enqueuedVacuum;
      this._enqueuedVacuum = null;
    }
    vacuumConditionsMet(conditions) {
      if (conditions == null) {
        return true;
      }
      let { minDirtCount, minDirtFactor } = conditions;
      minDirtCount = minDirtCount || defaultAutoVacuumOptions.minDirtCount;
      minDirtFactor = minDirtFactor || defaultAutoVacuumOptions.minDirtFactor;
      return this.dirtCount >= minDirtCount && this.dirtFactor >= minDirtFactor;
    }
    /**
     * Is `true` if a vacuuming operation is ongoing, `false` otherwise
     */
    get isVacuuming() {
      return this._currentVacuum != null;
    }
    /**
     * The number of documents discarded since the most recent vacuuming
     */
    get dirtCount() {
      return this._dirtCount;
    }
    /**
     * A number between 0 and 1 giving an indication about the proportion of
     * documents that are discarded, and can therefore be cleaned up by vacuuming.
     * A value close to 0 means that the index is relatively clean, while a higher
     * value means that the index is relatively dirty, and vacuuming could release
     * memory.
     */
    get dirtFactor() {
      return this._dirtCount / (1 + this._documentCount + this._dirtCount);
    }
    /**
     * Returns `true` if a document with the given ID is present in the index and
     * available for search, `false` otherwise
     *
     * @param id  The document ID
     */
    has(id) {
      return this._idToShortId.has(id);
    }
    /**
     * Returns the stored fields (as configured in the `storeFields` constructor
     * option) for the given document ID. Returns `undefined` if the document is
     * not present in the index.
     *
     * @param id  The document ID
     */
    getStoredFields(id) {
      const shortId = this._idToShortId.get(id);
      if (shortId == null) {
        return void 0;
      }
      return this._storedFields.get(shortId);
    }
    /**
     * Search for documents matching the given search query.
     *
     * The result is a list of scored document IDs matching the query, sorted by
     * descending score, and each including data about which terms were matched and
     * in which fields.
     *
     * ### Basic usage:
     *
     * ```javascript
     * // Search for "zen art motorcycle" with default options: terms have to match
     * // exactly, and individual terms are joined with OR
     * miniSearch.search('zen art motorcycle')
     * // => [ { id: 2, score: 2.77258, match: { ... } }, { id: 4, score: 1.38629, match: { ... } } ]
     * ```
     *
     * ### Restrict search to specific fields:
     *
     * ```javascript
     * // Search only in the 'title' field
     * miniSearch.search('zen', { fields: ['title'] })
     * ```
     *
     * ### Field boosting:
     *
     * ```javascript
     * // Boost a field
     * miniSearch.search('zen', { boost: { title: 2 } })
     * ```
     *
     * ### Prefix search:
     *
     * ```javascript
     * // Search for "moto" with prefix search (it will match documents
     * // containing terms that start with "moto" or "neuro")
     * miniSearch.search('moto neuro', { prefix: true })
     * ```
     *
     * ### Fuzzy search:
     *
     * ```javascript
     * // Search for "ismael" with fuzzy search (it will match documents containing
     * // terms similar to "ismael", with a maximum edit distance of 0.2 term.length
     * // (rounded to nearest integer)
     * miniSearch.search('ismael', { fuzzy: 0.2 })
     * ```
     *
     * ### Combining strategies:
     *
     * ```javascript
     * // Mix of exact match, prefix search, and fuzzy search
     * miniSearch.search('ismael mob', {
     *  prefix: true,
     *  fuzzy: 0.2
     * })
     * ```
     *
     * ### Advanced prefix and fuzzy search:
     *
     * ```javascript
     * // Perform fuzzy and prefix search depending on the search term. Here
     * // performing prefix and fuzzy search only on terms longer than 3 characters
     * miniSearch.search('ismael mob', {
     *  prefix: term => term.length > 3
     *  fuzzy: term => term.length > 3 ? 0.2 : null
     * })
     * ```
     *
     * ### Combine with AND:
     *
     * ```javascript
     * // Combine search terms with AND (to match only documents that contain both
     * // "motorcycle" and "art")
     * miniSearch.search('motorcycle art', { combineWith: 'AND' })
     * ```
     *
     * ### Combine with AND_NOT:
     *
     * There is also an AND_NOT combinator, that finds documents that match the
     * first term, but do not match any of the other terms. This combinator is
     * rarely useful with simple queries, and is meant to be used with advanced
     * query combinations (see later for more details).
     *
     * ### Filtering results:
     *
     * ```javascript
     * // Filter only results in the 'fiction' category (assuming that 'category'
     * // is a stored field)
     * miniSearch.search('motorcycle art', {
     *   filter: (result) => result.category === 'fiction'
     * })
     * ```
     *
     * ### Wildcard query
     *
     * Searching for an empty string (assuming the default tokenizer) returns no
     * results. Sometimes though, one needs to match all documents, like in a
     * "wildcard" search. This is possible by passing the special value
     * {@link MiniSearch.wildcard} as the query:
     *
     * ```javascript
     * // Return search results for all documents
     * miniSearch.search(MiniSearch.wildcard)
     * ```
     *
     * Note that search options such as `filter` and `boostDocument` are still
     * applied, influencing which results are returned, and their order:
     *
     * ```javascript
     * // Return search results for all documents in the 'fiction' category
     * miniSearch.search(MiniSearch.wildcard, {
     *   filter: (result) => result.category === 'fiction'
     * })
     * ```
     *
     * ### Advanced combination of queries:
     *
     * It is possible to combine different subqueries with OR, AND, and AND_NOT,
     * and even with different search options, by passing a query expression
     * tree object as the first argument, instead of a string.
     *
     * ```javascript
     * // Search for documents that contain "zen" and ("motorcycle" or "archery")
     * miniSearch.search({
     *   combineWith: 'AND',
     *   queries: [
     *     'zen',
     *     {
     *       combineWith: 'OR',
     *       queries: ['motorcycle', 'archery']
     *     }
     *   ]
     * })
     *
     * // Search for documents that contain ("apple" or "pear") but not "juice" and
     * // not "tree"
     * miniSearch.search({
     *   combineWith: 'AND_NOT',
     *   queries: [
     *     {
     *       combineWith: 'OR',
     *       queries: ['apple', 'pear']
     *     },
     *     'juice',
     *     'tree'
     *   ]
     * })
     * ```
     *
     * Each node in the expression tree can be either a string, or an object that
     * supports all {@link SearchOptions} fields, plus a `queries` array field for
     * subqueries.
     *
     * Note that, while this can become complicated to do by hand for complex or
     * deeply nested queries, it provides a formalized expression tree API for
     * external libraries that implement a parser for custom query languages.
     *
     * @param query  Search query
     * @param searchOptions  Search options. Each option, if not given, defaults to the corresponding value of `searchOptions` given to the constructor, or to the library default.
     */
    search(query, searchOptions = {}) {
      const { searchOptions: globalSearchOptions } = this._options;
      const searchOptionsWithDefaults = { ...globalSearchOptions, ...searchOptions };
      const rawResults = this.executeQuery(query, searchOptions);
      const results = [];
      for (const [docId, { score, terms, match }] of rawResults) {
        const quality = terms.length || 1;
        const result = {
          id: this._documentIds.get(docId),
          score: score * quality,
          terms: Object.keys(match),
          queryTerms: terms,
          match
        };
        Object.assign(result, this._storedFields.get(docId));
        if (searchOptionsWithDefaults.filter == null || searchOptionsWithDefaults.filter(result)) {
          results.push(result);
        }
      }
      if (query === _MiniSearch.wildcard && searchOptionsWithDefaults.boostDocument == null) {
        return results;
      }
      results.sort(byScore);
      return results;
    }
    /**
     * Provide suggestions for the given search query
     *
     * The result is a list of suggested modified search queries, derived from the
     * given search query, each with a relevance score, sorted by descending score.
     *
     * By default, it uses the same options used for search, except that by
     * default it performs prefix search on the last term of the query, and
     * combine terms with `'AND'` (requiring all query terms to match). Custom
     * options can be passed as a second argument. Defaults can be changed upon
     * calling the {@link MiniSearch} constructor, by passing a
     * `autoSuggestOptions` option.
     *
     * ### Basic usage:
     *
     * ```javascript
     * // Get suggestions for 'neuro':
     * miniSearch.autoSuggest('neuro')
     * // => [ { suggestion: 'neuromancer', terms: [ 'neuromancer' ], score: 0.46240 } ]
     * ```
     *
     * ### Multiple words:
     *
     * ```javascript
     * // Get suggestions for 'zen ar':
     * miniSearch.autoSuggest('zen ar')
     * // => [
     * //  { suggestion: 'zen archery art', terms: [ 'zen', 'archery', 'art' ], score: 1.73332 },
     * //  { suggestion: 'zen art', terms: [ 'zen', 'art' ], score: 1.21313 }
     * // ]
     * ```
     *
     * ### Fuzzy suggestions:
     *
     * ```javascript
     * // Correct spelling mistakes using fuzzy search:
     * miniSearch.autoSuggest('neromancer', { fuzzy: 0.2 })
     * // => [ { suggestion: 'neuromancer', terms: [ 'neuromancer' ], score: 1.03998 } ]
     * ```
     *
     * ### Filtering:
     *
     * ```javascript
     * // Get suggestions for 'zen ar', but only within the 'fiction' category
     * // (assuming that 'category' is a stored field):
     * miniSearch.autoSuggest('zen ar', {
     *   filter: (result) => result.category === 'fiction'
     * })
     * // => [
     * //  { suggestion: 'zen archery art', terms: [ 'zen', 'archery', 'art' ], score: 1.73332 },
     * //  { suggestion: 'zen art', terms: [ 'zen', 'art' ], score: 1.21313 }
     * // ]
     * ```
     *
     * @param queryString  Query string to be expanded into suggestions
     * @param options  Search options. The supported options and default values
     * are the same as for the {@link MiniSearch#search} method, except that by
     * default prefix search is performed on the last term in the query, and terms
     * are combined with `'AND'`.
     * @return  A sorted array of suggestions sorted by relevance score.
     */
    autoSuggest(queryString, options = {}) {
      options = { ...this._options.autoSuggestOptions, ...options };
      const suggestions = /* @__PURE__ */ new Map();
      for (const { score, terms } of this.search(queryString, options)) {
        const phrase = terms.join(" ");
        const suggestion = suggestions.get(phrase);
        if (suggestion != null) {
          suggestion.score += score;
          suggestion.count += 1;
        } else {
          suggestions.set(phrase, { score, terms, count: 1 });
        }
      }
      const results = [];
      for (const [suggestion, { score, terms, count }] of suggestions) {
        results.push({ suggestion, terms, score: score / count });
      }
      results.sort(byScore);
      return results;
    }
    /**
     * Total number of documents available to search
     */
    get documentCount() {
      return this._documentCount;
    }
    /**
     * Number of terms in the index
     */
    get termCount() {
      return this._index.size;
    }
    /**
     * Deserializes a JSON index (serialized with `JSON.stringify(miniSearch)`)
     * and instantiates a MiniSearch instance. It should be given the same options
     * originally used when serializing the index.
     *
     * ### Usage:
     *
     * ```javascript
     * // If the index was serialized with:
     * let miniSearch = new MiniSearch({ fields: ['title', 'text'] })
     * miniSearch.addAll(documents)
     *
     * const json = JSON.stringify(miniSearch)
     * // It can later be deserialized like this:
     * miniSearch = MiniSearch.loadJSON(json, { fields: ['title', 'text'] })
     * ```
     *
     * @param json  JSON-serialized index
     * @param options  configuration options, same as the constructor
     * @return An instance of MiniSearch deserialized from the given JSON.
     */
    static loadJSON(json, options) {
      if (options == null) {
        throw new Error("MiniSearch: loadJSON should be given the same options used when serializing the index");
      }
      return this.loadJS(JSON.parse(json), options);
    }
    /**
     * Async equivalent of {@link MiniSearch.loadJSON}
     *
     * This function is an alternative to {@link MiniSearch.loadJSON} that returns
     * a promise, and loads the index in batches, leaving pauses between them to avoid
     * blocking the main thread. It tends to be slower than the synchronous
     * version, but does not block the main thread, so it can be a better choice
     * when deserializing very large indexes.
     *
     * @param json  JSON-serialized index
     * @param options  configuration options, same as the constructor
     * @return A Promise that will resolve to an instance of MiniSearch deserialized from the given JSON.
     */
    static async loadJSONAsync(json, options) {
      if (options == null) {
        throw new Error("MiniSearch: loadJSON should be given the same options used when serializing the index");
      }
      return this.loadJSAsync(JSON.parse(json), options);
    }
    /**
     * Returns the default value of an option. It will throw an error if no option
     * with the given name exists.
     *
     * @param optionName  Name of the option
     * @return The default value of the given option
     *
     * ### Usage:
     *
     * ```javascript
     * // Get default tokenizer
     * MiniSearch.getDefault('tokenize')
     *
     * // Get default term processor
     * MiniSearch.getDefault('processTerm')
     *
     * // Unknown options will throw an error
     * MiniSearch.getDefault('notExisting')
     * // => throws 'MiniSearch: unknown option "notExisting"'
     * ```
     */
    static getDefault(optionName) {
      if (defaultOptions.hasOwnProperty(optionName)) {
        return getOwnProperty(defaultOptions, optionName);
      } else {
        throw new Error(`MiniSearch: unknown option "${optionName}"`);
      }
    }
    /**
     * @ignore
     */
    static loadJS(js, options) {
      const { index, documentIds, fieldLength, storedFields, serializationVersion } = js;
      const miniSearch = this.instantiateMiniSearch(js, options);
      miniSearch._documentIds = objectToNumericMap(documentIds);
      miniSearch._fieldLength = objectToNumericMap(fieldLength);
      miniSearch._storedFields = objectToNumericMap(storedFields);
      for (const [shortId, id] of miniSearch._documentIds) {
        miniSearch._idToShortId.set(id, shortId);
      }
      for (const [term, data] of index) {
        const dataMap = /* @__PURE__ */ new Map();
        for (const fieldId of Object.keys(data)) {
          let indexEntry = data[fieldId];
          if (serializationVersion === 1) {
            indexEntry = indexEntry.ds;
          }
          dataMap.set(parseInt(fieldId, 10), objectToNumericMap(indexEntry));
        }
        miniSearch._index.set(term, dataMap);
      }
      return miniSearch;
    }
    /**
     * @ignore
     */
    static async loadJSAsync(js, options) {
      const { index, documentIds, fieldLength, storedFields, serializationVersion } = js;
      const miniSearch = this.instantiateMiniSearch(js, options);
      miniSearch._documentIds = await objectToNumericMapAsync(documentIds);
      miniSearch._fieldLength = await objectToNumericMapAsync(fieldLength);
      miniSearch._storedFields = await objectToNumericMapAsync(storedFields);
      for (const [shortId, id] of miniSearch._documentIds) {
        miniSearch._idToShortId.set(id, shortId);
      }
      let count = 0;
      for (const [term, data] of index) {
        const dataMap = /* @__PURE__ */ new Map();
        for (const fieldId of Object.keys(data)) {
          let indexEntry = data[fieldId];
          if (serializationVersion === 1) {
            indexEntry = indexEntry.ds;
          }
          dataMap.set(parseInt(fieldId, 10), await objectToNumericMapAsync(indexEntry));
        }
        if (++count % 1e3 === 0)
          await wait(0);
        miniSearch._index.set(term, dataMap);
      }
      return miniSearch;
    }
    /**
     * @ignore
     */
    static instantiateMiniSearch(js, options) {
      const { documentCount, nextId, fieldIds, averageFieldLength, dirtCount, serializationVersion } = js;
      if (serializationVersion !== 1 && serializationVersion !== 2) {
        throw new Error("MiniSearch: cannot deserialize an index created with an incompatible version");
      }
      const miniSearch = new _MiniSearch(options);
      miniSearch._documentCount = documentCount;
      miniSearch._nextId = nextId;
      miniSearch._idToShortId = /* @__PURE__ */ new Map();
      miniSearch._fieldIds = fieldIds;
      miniSearch._avgFieldLength = averageFieldLength;
      miniSearch._dirtCount = dirtCount || 0;
      miniSearch._index = new SearchableMap();
      return miniSearch;
    }
    /**
     * @ignore
     */
    executeQuery(query, searchOptions = {}) {
      if (query === _MiniSearch.wildcard) {
        return this.executeWildcardQuery(searchOptions);
      }
      if (typeof query !== "string") {
        const options2 = { ...searchOptions, ...query, queries: void 0 };
        const results2 = query.queries.map((subquery) => this.executeQuery(subquery, options2));
        return this.combineResults(results2, options2.combineWith);
      }
      const { tokenize, processTerm, searchOptions: globalSearchOptions } = this._options;
      const options = { tokenize, processTerm, ...globalSearchOptions, ...searchOptions };
      const { tokenize: searchTokenize, processTerm: searchProcessTerm } = options;
      const terms = searchTokenize(query).flatMap((term) => searchProcessTerm(term)).filter((term) => !!term);
      const queries = terms.map(termToQuerySpec(options));
      const results = queries.map((query2) => this.executeQuerySpec(query2, options));
      return this.combineResults(results, options.combineWith);
    }
    /**
     * @ignore
     */
    executeQuerySpec(query, searchOptions) {
      const options = { ...this._options.searchOptions, ...searchOptions };
      const boosts = (options.fields || this._options.fields).reduce((boosts2, field2) => ({ ...boosts2, [field2]: getOwnProperty(options.boost, field2) || 1 }), {});
      const { boostDocument, weights, maxFuzzy, bm25: bm25params } = options;
      const { fuzzy: fuzzyWeight, prefix: prefixWeight } = { ...defaultSearchOptions.weights, ...weights };
      const data = this._index.get(query.term);
      const results = this.termResults(query.term, query.term, 1, query.termBoost, data, boosts, boostDocument, bm25params);
      let prefixMatches;
      let fuzzyMatches;
      if (query.prefix) {
        prefixMatches = this._index.atPrefix(query.term);
      }
      if (query.fuzzy) {
        const fuzzy = query.fuzzy === true ? 0.2 : query.fuzzy;
        const maxDistance = fuzzy < 1 ? Math.min(maxFuzzy, Math.round(query.term.length * fuzzy)) : fuzzy;
        if (maxDistance)
          fuzzyMatches = this._index.fuzzyGet(query.term, maxDistance);
      }
      if (prefixMatches) {
        for (const [term, data2] of prefixMatches) {
          const distance = term.length - query.term.length;
          if (!distance) {
            continue;
          }
          fuzzyMatches === null || fuzzyMatches === void 0 ? void 0 : fuzzyMatches.delete(term);
          const weight = prefixWeight * term.length / (term.length + 0.3 * distance);
          this.termResults(query.term, term, weight, query.termBoost, data2, boosts, boostDocument, bm25params, results);
        }
      }
      if (fuzzyMatches) {
        for (const term of fuzzyMatches.keys()) {
          const [data2, distance] = fuzzyMatches.get(term);
          if (!distance) {
            continue;
          }
          const weight = fuzzyWeight * term.length / (term.length + distance);
          this.termResults(query.term, term, weight, query.termBoost, data2, boosts, boostDocument, bm25params, results);
        }
      }
      return results;
    }
    /**
     * @ignore
     */
    executeWildcardQuery(searchOptions) {
      const results = /* @__PURE__ */ new Map();
      const options = { ...this._options.searchOptions, ...searchOptions };
      for (const [shortId, id] of this._documentIds) {
        const score = options.boostDocument ? options.boostDocument(id, "", this._storedFields.get(shortId)) : 1;
        results.set(shortId, {
          score,
          terms: [],
          match: {}
        });
      }
      return results;
    }
    /**
     * @ignore
     */
    combineResults(results, combineWith = OR) {
      if (results.length === 0) {
        return /* @__PURE__ */ new Map();
      }
      const operator = combineWith.toLowerCase();
      const combinator = combinators[operator];
      if (!combinator) {
        throw new Error(`Invalid combination operator: ${combineWith}`);
      }
      return results.reduce(combinator) || /* @__PURE__ */ new Map();
    }
    /**
     * Allows serialization of the index to JSON, to possibly store it and later
     * deserialize it with {@link MiniSearch.loadJSON}.
     *
     * Normally one does not directly call this method, but rather call the
     * standard JavaScript `JSON.stringify()` passing the {@link MiniSearch}
     * instance, and JavaScript will internally call this method. Upon
     * deserialization, one must pass to {@link MiniSearch.loadJSON} the same
     * options used to create the original instance that was serialized.
     *
     * ### Usage:
     *
     * ```javascript
     * // Serialize the index:
     * let miniSearch = new MiniSearch({ fields: ['title', 'text'] })
     * miniSearch.addAll(documents)
     * const json = JSON.stringify(miniSearch)
     *
     * // Later, to deserialize it:
     * miniSearch = MiniSearch.loadJSON(json, { fields: ['title', 'text'] })
     * ```
     *
     * @return A plain-object serializable representation of the search index.
     */
    toJSON() {
      const index = [];
      for (const [term, fieldIndex] of this._index) {
        const data = {};
        for (const [fieldId, freqs] of fieldIndex) {
          data[fieldId] = Object.fromEntries(freqs);
        }
        index.push([term, data]);
      }
      return {
        documentCount: this._documentCount,
        nextId: this._nextId,
        documentIds: Object.fromEntries(this._documentIds),
        fieldIds: this._fieldIds,
        fieldLength: Object.fromEntries(this._fieldLength),
        averageFieldLength: this._avgFieldLength,
        storedFields: Object.fromEntries(this._storedFields),
        dirtCount: this._dirtCount,
        index,
        serializationVersion: 2
      };
    }
    /**
     * @ignore
     */
    termResults(sourceTerm, derivedTerm, termWeight, termBoost, fieldTermData, fieldBoosts, boostDocumentFn, bm25params, results = /* @__PURE__ */ new Map()) {
      if (fieldTermData == null)
        return results;
      for (const field2 of Object.keys(fieldBoosts)) {
        const fieldBoost = fieldBoosts[field2];
        const fieldId = this._fieldIds[field2];
        const fieldTermFreqs = fieldTermData.get(fieldId);
        if (fieldTermFreqs == null)
          continue;
        let matchingFields = fieldTermFreqs.size;
        const avgFieldLength = this._avgFieldLength[fieldId];
        for (const docId of fieldTermFreqs.keys()) {
          if (!this._documentIds.has(docId)) {
            this.removeTerm(fieldId, docId, derivedTerm);
            matchingFields -= 1;
            continue;
          }
          const docBoost = boostDocumentFn ? boostDocumentFn(this._documentIds.get(docId), derivedTerm, this._storedFields.get(docId)) : 1;
          if (!docBoost)
            continue;
          const termFreq = fieldTermFreqs.get(docId);
          const fieldLength = this._fieldLength.get(docId)[fieldId];
          const rawScore = calcBM25Score(termFreq, matchingFields, this._documentCount, fieldLength, avgFieldLength, bm25params);
          const weightedScore = termWeight * termBoost * fieldBoost * docBoost * rawScore;
          const result = results.get(docId);
          if (result) {
            result.score += weightedScore;
            assignUniqueTerm(result.terms, sourceTerm);
            const match = getOwnProperty(result.match, derivedTerm);
            if (match) {
              match.push(field2);
            } else {
              result.match[derivedTerm] = [field2];
            }
          } else {
            results.set(docId, {
              score: weightedScore,
              terms: [sourceTerm],
              match: { [derivedTerm]: [field2] }
            });
          }
        }
      }
      return results;
    }
    /**
     * @ignore
     */
    addTerm(fieldId, documentId, term) {
      const indexData = this._index.fetch(term, createMap);
      let fieldIndex = indexData.get(fieldId);
      if (fieldIndex == null) {
        fieldIndex = /* @__PURE__ */ new Map();
        fieldIndex.set(documentId, 1);
        indexData.set(fieldId, fieldIndex);
      } else {
        const docs = fieldIndex.get(documentId);
        fieldIndex.set(documentId, (docs || 0) + 1);
      }
    }
    /**
     * @ignore
     */
    removeTerm(fieldId, documentId, term) {
      if (!this._index.has(term)) {
        this.warnDocumentChanged(documentId, fieldId, term);
        return;
      }
      const indexData = this._index.fetch(term, createMap);
      const fieldIndex = indexData.get(fieldId);
      if (fieldIndex == null || fieldIndex.get(documentId) == null) {
        this.warnDocumentChanged(documentId, fieldId, term);
      } else if (fieldIndex.get(documentId) <= 1) {
        if (fieldIndex.size <= 1) {
          indexData.delete(fieldId);
        } else {
          fieldIndex.delete(documentId);
        }
      } else {
        fieldIndex.set(documentId, fieldIndex.get(documentId) - 1);
      }
      if (this._index.get(term).size === 0) {
        this._index.delete(term);
      }
    }
    /**
     * @ignore
     */
    warnDocumentChanged(shortDocumentId, fieldId, term) {
      for (const fieldName of Object.keys(this._fieldIds)) {
        if (this._fieldIds[fieldName] === fieldId) {
          this._options.logger("warn", `MiniSearch: document with ID ${this._documentIds.get(shortDocumentId)} has changed before removal: term "${term}" was not present in field "${fieldName}". Removing a document after it has changed can corrupt the index!`, "version_conflict");
          return;
        }
      }
    }
    /**
     * @ignore
     */
    addDocumentId(documentId) {
      const shortDocumentId = this._nextId;
      this._idToShortId.set(documentId, shortDocumentId);
      this._documentIds.set(shortDocumentId, documentId);
      this._documentCount += 1;
      this._nextId += 1;
      return shortDocumentId;
    }
    /**
     * @ignore
     */
    addFields(fields) {
      for (let i = 0; i < fields.length; i++) {
        this._fieldIds[fields[i]] = i;
      }
    }
    /**
     * @ignore
     */
    addFieldLength(documentId, fieldId, count, length) {
      let fieldLengths = this._fieldLength.get(documentId);
      if (fieldLengths == null)
        this._fieldLength.set(documentId, fieldLengths = []);
      fieldLengths[fieldId] = length;
      const averageFieldLength = this._avgFieldLength[fieldId] || 0;
      const totalFieldLength = averageFieldLength * count + length;
      this._avgFieldLength[fieldId] = totalFieldLength / (count + 1);
    }
    /**
     * @ignore
     */
    removeFieldLength(documentId, fieldId, count, length) {
      if (count === 1) {
        this._avgFieldLength[fieldId] = 0;
        return;
      }
      const totalFieldLength = this._avgFieldLength[fieldId] * count - length;
      this._avgFieldLength[fieldId] = totalFieldLength / (count - 1);
    }
    /**
     * @ignore
     */
    saveStoredFields(documentId, doc) {
      const { storeFields, extractField } = this._options;
      if (storeFields == null || storeFields.length === 0) {
        return;
      }
      let documentFields = this._storedFields.get(documentId);
      if (documentFields == null)
        this._storedFields.set(documentId, documentFields = {});
      for (const fieldName of storeFields) {
        const fieldValue = extractField(doc, fieldName);
        if (fieldValue !== void 0)
          documentFields[fieldName] = fieldValue;
      }
    }
  };
  MiniSearch.wildcard = Symbol("*");
  var getOwnProperty = (object, property) => Object.prototype.hasOwnProperty.call(object, property) ? object[property] : void 0;
  var combinators = {
    [OR]: (a, b) => {
      for (const docId of b.keys()) {
        const existing = a.get(docId);
        if (existing == null) {
          a.set(docId, b.get(docId));
        } else {
          const { score, terms, match } = b.get(docId);
          existing.score = existing.score + score;
          existing.match = Object.assign(existing.match, match);
          assignUniqueTerms(existing.terms, terms);
        }
      }
      return a;
    },
    [AND]: (a, b) => {
      const combined = /* @__PURE__ */ new Map();
      for (const docId of b.keys()) {
        const existing = a.get(docId);
        if (existing == null)
          continue;
        const { score, terms, match } = b.get(docId);
        assignUniqueTerms(existing.terms, terms);
        combined.set(docId, {
          score: existing.score + score,
          terms: existing.terms,
          match: Object.assign(existing.match, match)
        });
      }
      return combined;
    },
    [AND_NOT]: (a, b) => {
      for (const docId of b.keys())
        a.delete(docId);
      return a;
    }
  };
  var defaultBM25params = { k: 1.2, b: 0.7, d: 0.5 };
  var calcBM25Score = (termFreq, matchingCount, totalCount, fieldLength, avgFieldLength, bm25params) => {
    const { k, b, d } = bm25params;
    const invDocFreq = Math.log(1 + (totalCount - matchingCount + 0.5) / (matchingCount + 0.5));
    return invDocFreq * (d + termFreq * (k + 1) / (termFreq + k * (1 - b + b * fieldLength / avgFieldLength)));
  };
  var termToQuerySpec = (options) => (term, i, terms) => {
    const fuzzy = typeof options.fuzzy === "function" ? options.fuzzy(term, i, terms) : options.fuzzy || false;
    const prefix = typeof options.prefix === "function" ? options.prefix(term, i, terms) : options.prefix === true;
    const termBoost = typeof options.boostTerm === "function" ? options.boostTerm(term, i, terms) : 1;
    return { term, fuzzy, prefix, termBoost };
  };
  var defaultOptions = {
    idField: "id",
    extractField: (document2, fieldName) => document2[fieldName],
    stringifyField: (fieldValue, fieldName) => fieldValue.toString(),
    tokenize: (text) => text.split(SPACE_OR_PUNCTUATION),
    processTerm: (term) => term.toLowerCase(),
    fields: void 0,
    searchOptions: void 0,
    storeFields: [],
    logger: (level, message) => {
      if (typeof (console === null || console === void 0 ? void 0 : console[level]) === "function")
        console[level](message);
    },
    autoVacuum: true
  };
  var defaultSearchOptions = {
    combineWith: OR,
    prefix: false,
    fuzzy: false,
    maxFuzzy: 6,
    boost: {},
    weights: { fuzzy: 0.45, prefix: 0.375 },
    bm25: defaultBM25params
  };
  var defaultAutoSuggestOptions = {
    combineWith: AND,
    prefix: (term, i, terms) => i === terms.length - 1
  };
  var defaultVacuumOptions = { batchSize: 1e3, batchWait: 10 };
  var defaultVacuumConditions = { minDirtFactor: 0.1, minDirtCount: 20 };
  var defaultAutoVacuumOptions = { ...defaultVacuumOptions, ...defaultVacuumConditions };
  var assignUniqueTerm = (target, term) => {
    if (!target.includes(term))
      target.push(term);
  };
  var assignUniqueTerms = (target, source) => {
    for (const term of source) {
      if (!target.includes(term))
        target.push(term);
    }
  };
  var byScore = ({ score: a }, { score: b }) => b - a;
  var createMap = () => /* @__PURE__ */ new Map();
  var objectToNumericMap = (object) => {
    const map = /* @__PURE__ */ new Map();
    for (const key2 of Object.keys(object)) {
      map.set(parseInt(key2, 10), object[key2]);
    }
    return map;
  };
  var objectToNumericMapAsync = async (object) => {
    const map = /* @__PURE__ */ new Map();
    let count = 0;
    for (const key2 of Object.keys(object)) {
      map.set(parseInt(key2, 10), object[key2]);
      if (++count % 1e3 === 0) {
        await wait(0);
      }
    }
    return map;
  };
  var wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  var SPACE_OR_PUNCTUATION = /[\n\r\p{Z}\p{P}]+/u;

  // src/lib/search.js
  var SEARCH_OPTIONS = {
    idField: "id",
    fields: ["text"],
    storeFields: ["manufacturer", "doc", "page", "text"],
    searchOptions: { prefix: true, fuzzy: 0.2, combineWith: "AND" }
  };
  function loadIndex(obj) {
    return MiniSearch.loadJS(obj, SEARCH_OPTIONS);
  }
  function makeSnippet(text, query, radius = 120) {
    const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
    const lower = text.toLowerCase();
    let at = -1;
    for (const t of terms) {
      const i = lower.indexOf(t);
      if (i !== -1 && (at === -1 || i < at)) at = i;
    }
    if (at === -1) at = 0;
    const start = Math.max(0, at - radius);
    const end = Math.min(text.length, at + radius);
    const body = text.slice(start, end).replace(/\s+/g, " ").trim();
    return `${start > 0 ? "..." : ""}${body}${end < text.length ? "..." : ""}`;
  }
  function searchManuals(index, query, { manufacturer, limit = 50 } = {}) {
    const q = String(query || "").trim();
    if (!q) return [];
    const hits = index.search(q, { filter: (r) => !manufacturer || r.manufacturer === manufacturer });
    return hits.slice(0, limit).map((h2) => ({
      manufacturer: h2.manufacturer,
      doc: h2.doc,
      page: h2.page,
      score: h2.score,
      snippet: makeSnippet(h2.text, q)
    }));
  }
  function pdfHref({ manufacturer, doc, page }) {
    if (!Number.isInteger(page) || page < 1) throw new RangeError("page must be an integer >= 1");
    const enc = (path) => path.split("/").map(encodeURIComponent).join("/");
    return `../pdfs/${encodeURIComponent(manufacturer)}/${enc(doc)}#page=${page}`;
  }

  // src/lib/pt.js
  var KEYS2 = { bubble: "bubblePsig", dew: "dewPsig" };
  function loadTable(raw) {
    const name = raw && raw.refrigerant;
    if (!raw || !Array.isArray(raw.points) || raw.points.length < 2) {
      throw new Error(`PT table ${name || "(unnamed)"}: needs at least two points`);
    }
    const points = raw.points;
    points.forEach((p, i) => {
      for (const k of ["tF", "bubblePsig", "dewPsig"]) {
        if (typeof p[k] !== "number" || !Number.isFinite(p[k])) {
          throw new Error(`PT table ${name}: point ${i} has invalid ${k}`);
        }
      }
      if (i > 0) {
        const q = points[i - 1];
        if (p.tF <= q.tF || p.bubblePsig <= q.bubblePsig || p.dewPsig <= q.dewPsig) {
          throw new Error(`PT table ${name}: values must be strictly increasing (point ${i})`);
        }
      }
      if (p.dewPsig > p.bubblePsig + 0.05) {
        throw new Error(`PT table ${name}: point ${i} has dew pressure above bubble pressure`);
      }
    });
    return { refrigerant: raw.refrigerant, source: raw.source, points };
  }
  function lookup2(points, xKey, yKey, x, label) {
    if (typeof x !== "number" || !Number.isFinite(x)) throw new RangeError(`${label} must be a number`);
    const first = points[0][xKey];
    const last2 = points[points.length - 1][xKey];
    if (x < first || x > last2) {
      throw new RangeError(`${label} ${x} is outside the table range ${first} to ${last2}`);
    }
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (x >= a[xKey] && x <= b[xKey]) {
        const f = (x - a[xKey]) / (b[xKey] - a[xKey]);
        return a[yKey] + f * (b[yKey] - a[yKey]);
      }
    }
    throw new RangeError(`${label} ${x} could not be interpolated`);
  }
  function key(phase) {
    const k = KEYS2[phase];
    if (!k) throw new Error(`phase must be "bubble" or "dew", got "${phase}"`);
    return k;
  }
  function satTemp(table, psig, phase) {
    const k = key(phase);
    return lookup2(table.points, k, "tF", psig, "Pressure (psig)");
  }
  function buildTables(rawList) {
    const tables = {};
    for (const raw of rawList) {
      const t = loadTable(raw);
      tables[t.refrigerant] = t;
    }
    return tables;
  }

  // app/src/dom.js
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === void 0 || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) {
        if (typeof v !== "function") throw new TypeError(`h(): ${k} must be a function`);
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of children.flat()) {
      if (c === null || c === void 0 || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  function clear(el) {
    el.replaceChildren();
  }

  // src/lib/tree.js
  function validateTree(tree) {
    if (!tree || typeof tree !== "object") return ["tree must be an object"];
    const errors = [];
    const id = typeof tree.id === "string" && tree.id ? tree.id : "(no id)";
    if (id === "(no id)") errors.push("tree.id is required");
    if (typeof tree.title !== "string" || !tree.title) errors.push(`${id}: title is required`);
    const nodes = tree.nodes && typeof tree.nodes === "object" ? tree.nodes : null;
    if (!nodes) {
      errors.push(`${id}: nodes is required`);
      return errors;
    }
    if (!nodes[tree.start]) errors.push(`${id}: start node "${tree.start}" does not exist`);
    for (const [nid, node] of Object.entries(nodes)) {
      const at = `${id}.${nid}`;
      if (!node || typeof node !== "object") {
        errors.push(`${at}: node must be an object`);
      } else if (node.type === "question") {
        if (!node.text) errors.push(`${at}: question text is required`);
        if (!Array.isArray(node.options) || node.options.length < 2) {
          errors.push(`${at}: question needs at least two options`);
        } else {
          node.options.forEach((o, i) => {
            if (!o || !o.label) errors.push(`${at}: option ${i} needs a label`);
            else if (!nodes[o.next]) errors.push(`${at}: option ${i} points to missing node "${o.next}"`);
          });
        }
      } else if (node.type === "result") {
        if (!node.cause) errors.push(`${at}: result needs a cause`);
        if (!Array.isArray(node.fix) || node.fix.length === 0) errors.push(`${at}: result needs at least one fix step`);
        if (node.source !== void 0) {
          const s = node.source;
          if (!s || !s.manufacturer || !s.doc || !Number.isInteger(s.page) || s.page < 1) {
            errors.push(`${at}: source needs manufacturer, doc and an integer page >= 1`);
          }
        }
      } else {
        errors.push(`${at}: unknown type "${node.type}"`);
      }
    }
    if (errors.length) return errors;
    const state = {};
    const visit = (nid) => {
      if (state[nid] === 1) {
        errors.push(`${id}: cycle through "${nid}"`);
        return;
      }
      if (state[nid] === 2) return;
      state[nid] = 1;
      const n = nodes[nid];
      if (n.type === "question") for (const o of n.options) visit(o.next);
      state[nid] = 2;
    };
    visit(tree.start);
    for (const nid of Object.keys(nodes)) {
      if (!state[nid]) errors.push(`${id}: node "${nid}" is unreachable`);
    }
    return errors;
  }
  function createSession(tree) {
    const errors = validateTree(tree);
    if (errors.length) throw new Error(`Invalid tree: ${errors.join("; ")}`);
    const history = [];
    let currentId = tree.start;
    return {
      current() {
        return { id: currentId, ...tree.nodes[currentId] };
      },
      choose(index) {
        const node = tree.nodes[currentId];
        if (node.type !== "question") throw new Error("Current node is a result; there is nothing to choose");
        const option = Number.isInteger(index) ? node.options[index] : void 0;
        if (!option) throw new RangeError(`No option ${index}`);
        history.push({ from: currentId, choice: index });
        currentId = option.next;
      },
      back() {
        const last2 = history.pop();
        if (!last2) return false;
        currentId = last2.from;
        return true;
      },
      restart() {
        history.length = 0;
        currentId = tree.start;
      },
      path() {
        return history.map((h2) => ({
          question: tree.nodes[h2.from].text,
          answer: tree.nodes[h2.from].options[h2.choice].label
        }));
      },
      isDone() {
        return tree.nodes[currentId].type === "result";
      }
    };
  }

  // app/src/tabs/diagnose.js
  function renderDiagnose(root, ctx) {
    const trees = ctx.data.trees;
    if (trees.length === 0) {
      root.append(h("div", { class: "card" }, h("h2", {}, "Diagnose"), h("p", { class: "empty" }, "No decision trees are installed. Add files to data/trees/ and run npm run build.")));
      return;
    }
    const body = h("div");
    const pickerHeading = h("h2", { tabindex: "-1" }, "Diagnose");
    const picker = h("div", { class: "card" }, pickerHeading, h("p", { class: "empty" }, "Pick the problem, then answer each question."));
    for (const tree of trees) {
      picker.append(
        h(
          "button",
          { type: "button", class: "choice", onclick: () => start(tree) },
          tree.title,
          tree.generic ? h("span", { class: "badge" }, "generic") : null,
          tree.equipment ? h("span", { class: "badge" }, tree.equipment) : null
        )
      );
    }
    function start(tree) {
      const session = createSession(tree);
      const draw = () => {
        clear(body);
        const node = session.current();
        const trail = session.path();
        const heading = h("h2", { tabindex: "-1" }, tree.title, tree.generic ? h("span", { class: "badge" }, "generic guidance") : null);
        const card2 = h("div", { class: "card" }, heading);
        if (trail.length) {
          card2.append(h("div", { class: "path" }, trail.map((t) => h("div", {}, `${t.question} - ${t.answer}`))));
        }
        if (node.type === "question") {
          card2.append(h("p", {}, h("strong", {}, node.text)));
          node.options.forEach((o, i) => card2.append(h("button", { type: "button", class: "choice", onclick: () => {
            session.choose(i);
            draw();
          } }, o.label)));
        } else {
          card2.append(
            h("p", {}, h("strong", {}, "Likely cause: "), node.cause),
            h("strong", {}, "What to do"),
            h("ul", { class: "tight" }, node.fix.map((f) => h("li", {}, f)))
          );
          if (node.source) {
            card2.append(h("p", {}, h("a", { href: pdfHref(node.source), target: "_blank", rel: "noopener" }, `Manual: ${node.source.doc}, page ${node.source.page}`)));
          }
        }
        card2.append(
          h(
            "div",
            {},
            h("button", { type: "button", class: "secondary", onclick: () => {
              session.back();
              draw();
            } }, "Back"),
            h("button", { type: "button", class: "secondary", onclick: () => {
              session.restart();
              draw();
            } }, "Start over"),
            h("button", { type: "button", class: "secondary", onclick: () => {
              clear(body);
              body.append(picker);
              pickerHeading.focus();
            } }, "Choose another problem")
          )
        );
        body.append(card2);
        heading.focus();
      };
      draw();
    }
    body.append(picker);
    root.append(body);
  }

  // app/src/tabs/manuals.js
  function renderManuals(root, ctx) {
    const manifest = ctx.data.manifest;
    if (manifest.length === 0) {
      root.append(
        h(
          "div",
          { class: "card" },
          h("h2", {}, "Manuals"),
          h("p", { class: "empty" }, "No manuals are indexed yet. Put PDFs in pdfs/<manufacturer>/ (for example pdfs/tekmar/), run npm run build, and reload this page.")
        )
      );
      return;
    }
    const manufacturers = [...new Set(manifest.map((m) => m.manufacturer))].sort();
    const results = h("div", { role: "status", "aria-live": "polite" });
    const input = h("input", { type: "search", id: "manual-q", placeholder: "Search all manuals, e.g. lockout, pump delay, sensor", autocomplete: "off" });
    const select = h(
      "select",
      { id: "manual-mfr", "aria-label": "Manufacturer" },
      h("option", { value: "" }, "All manufacturers"),
      manufacturers.map((m) => h("option", { value: m }, m))
    );
    let timer = null;
    const run = () => {
      clear(results);
      const q = input.value.trim();
      if (!q) return;
      const hits = searchManuals(ctx.searchIndex, q, { manufacturer: select.value || void 0 });
      if (hits.length === 0) {
        results.append(h("p", { class: "empty" }, "No matches. Try fewer or different words."));
        return;
      }
      results.append(h("p", { class: "empty" }, `${hits.length} result${hits.length === 1 ? "" : "s"}`));
      for (const hit of hits) {
        results.append(
          h(
            "div",
            { class: "hit" },
            h("a", { href: pdfHref(hit), target: "_blank", rel: "noopener" }, `${hit.manufacturer} / ${hit.doc}, page ${hit.page}`),
            h("p", { class: "snippet" }, hit.snippet)
          )
        );
      }
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(run, 200);
    };
    input.addEventListener("input", schedule);
    select.addEventListener("change", run);
    root.append(
      h(
        "div",
        { class: "card" },
        h("h2", {}, "Manuals"),
        h("div", { class: "row" }, h("label", { class: "field" }, h("span", {}, "Search"), input), h("label", { class: "field" }, h("span", {}, "Manufacturer"), select)),
        h("p", { class: "empty" }, `${manifest.length} document${manifest.length === 1 ? "" : "s"} indexed. Links open the PDF at the matching page.`)
      ),
      results
    );
    input.focus();
  }

  // src/lib/num.js
  function parseNumber(value, name) {
    if (value === null || value === void 0) return void 0;
    const s = String(value).trim();
    if (s === "") return void 0;
    const n = Number(s);
    if (!Number.isFinite(n)) throw new RangeError(`${name} must be a number (use a dot for decimals)`);
    return n;
  }
  function requireNumber(value, name) {
    const n = parseNumber(value, name);
    if (n === void 0) throw new RangeError(`${name} is required`);
    return n;
  }
  var round1 = (x) => Math.round(x * 10) / 10;

  // src/lib/hydronic.js
  var WATER_FACTOR = 500;
  function finite(name, v) {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new RangeError(`${name} must be a finite number`);
  }
  function deltaT(supplyF, returnF) {
    finite("supplyF", supplyF);
    finite("returnF", returnF);
    return round1(Math.abs(supplyF - returnF));
  }
  function heatOutputBtuh(gpm, deltaTF, factor = WATER_FACTOR) {
    finite("gpm", gpm);
    finite("deltaTF", deltaTF);
    finite("factor", factor);
    if (gpm < 0) throw new RangeError("gpm must not be negative");
    if (factor <= 0) throw new RangeError("factor must be positive");
    return Math.round(gpm * deltaTF * factor);
  }
  function flowGpm(btuh, deltaTF, factor = WATER_FACTOR) {
    finite("btuh", btuh);
    finite("deltaTF", deltaTF);
    finite("factor", factor);
    if (deltaTF === 0) throw new RangeError("deltaT must not be zero");
    if (factor <= 0) throw new RangeError("factor must be positive");
    return round1(btuh / (deltaTF * factor));
  }
  function assessDeltaT(measuredF, target = {}) {
    finite("measuredF", measuredF);
    const { min, max } = target;
    const hasMin = Number.isFinite(min);
    const hasMax = Number.isFinite(max);
    if (!hasMin && !hasMax) {
      return { status: "no-target", hints: ["Enter the target delta-T range from the design documents or the manufacturer."] };
    }
    if (hasMin && hasMax && min > max) throw new RangeError("Target min must not exceed target max");
    if (hasMin && measuredF < min) {
      return {
        status: "low",
        hints: [
          "Excess flow, an open bypass, or a three-way valve stuck in bypass.",
          "A very light load (few terminal units calling).",
          "Terminal units not transferring heat: airflow, fouling, control valve not opening."
        ]
      };
    }
    if (hasMax && measuredF > max) {
      return {
        status: "high",
        hints: [
          "Low flow: pump speed, closed or partly closed valves, clogged strainer, air lock.",
          "A restricted circuit or a check valve stuck closed."
        ]
      };
    }
    return { status: "ok", hints: ["Delta-T is within the target range."] };
  }

  // src/lib/reset.js
  function finite2(name, v) {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new RangeError(`${name} must be a finite number`);
  }
  function resetTarget({ outdoorF, outdoorDesignF, supplyDesignF, roomF = 70, supplyMinF, supplyMaxF }) {
    finite2("outdoorF", outdoorF);
    finite2("outdoorDesignF", outdoorDesignF);
    finite2("supplyDesignF", supplyDesignF);
    finite2("roomF", roomF);
    if (outdoorDesignF >= roomF) throw new RangeError("Design outdoor temperature must be below the room temperature");
    if (supplyDesignF <= roomF) throw new RangeError("Design supply temperature must be above the room temperature");
    if (Number.isFinite(supplyMinF) && Number.isFinite(supplyMaxF) && supplyMinF > supplyMaxF) {
      throw new RangeError("Minimum supply must not exceed maximum supply");
    }
    const ratio = Math.max(0, (roomF - outdoorF) / (roomF - outdoorDesignF));
    let target = roomF + (supplyDesignF - roomF) * ratio;
    if (Number.isFinite(supplyMinF)) target = Math.max(target, supplyMinF);
    if (Number.isFinite(supplyMaxF)) target = Math.min(target, supplyMaxF);
    return round1(target);
  }
  function assessSupply(measuredF, targetF, toleranceF = 5) {
    finite2("measuredF", measuredF);
    finite2("targetF", targetF);
    finite2("toleranceF", toleranceF);
    if (toleranceF < 0) throw new RangeError("Tolerance must not be negative");
    const difference = round1(measuredF - targetF);
    if (difference > toleranceF) return { status: "high", difference };
    if (difference < -toleranceF) return { status: "low", difference };
    return { status: "ok", difference };
  }

  // src/lib/refrigerant.js
  function finite3(name, v) {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new RangeError(`${name} must be a finite number`);
  }
  function superheat(table, { suctionPsig, suctionLineF }) {
    finite3("suctionPsig", suctionPsig);
    finite3("suctionLineF", suctionLineF);
    return round1(suctionLineF - satTemp(table, suctionPsig, "dew"));
  }
  function subcooling(table, { liquidPsig, liquidLineF }) {
    finite3("liquidPsig", liquidPsig);
    finite3("liquidLineF", liquidLineF);
    return round1(satTemp(table, liquidPsig, "bubble") - liquidLineF);
  }
  function rangeStatus(value, range = {}) {
    if (!Number.isFinite(value)) return "unknown";
    const hasMin = Number.isFinite(range.min);
    const hasMax = Number.isFinite(range.max);
    if (!hasMin && !hasMax) return "unknown";
    if (hasMin && value < range.min) return "low";
    if (hasMax && value > range.max) return "high";
    return "ok";
  }
  function interpretCharge({ superheat: sh, subcooling: sc }, targets = {}) {
    const shStatus = rangeStatus(sh, targets.superheat);
    const scStatus = rangeStatus(sc, targets.subcooling);
    const findings = [];
    if (!Number.isFinite(sh) || !Number.isFinite(sc)) {
      findings.push("Enter both suction and liquid readings to get an interpretation.");
      return { superheat: shStatus, subcooling: scStatus, findings };
    }
    if (shStatus === "unknown" || scStatus === "unknown") {
      findings.push("Enter target ranges for both superheat and subcooling from the unit data plate or manual to get an interpretation.");
      return { superheat: shStatus, subcooling: scStatus, findings };
    }
    if (shStatus === "ok" && scStatus === "ok") {
      findings.push("Superheat and subcooling are both within target.");
    } else if (shStatus === "high" && scStatus === "low") {
      findings.push("Pattern is consistent with low refrigerant charge. Leak-check and repair per the manufacturer procedure before recharging.");
    } else if (shStatus === "low" && scStatus === "high") {
      findings.push("Pattern is consistent with overcharge. Also check for a metering device overfeeding.");
    } else if (shStatus === "high" && scStatus === "high") {
      findings.push("Pattern is consistent with a restriction in the liquid line, filter-drier or metering device.");
    } else if (shStatus === "low" && scStatus === "low") {
      findings.push("Pattern is consistent with reduced compressor capacity. Also check airflow and load.");
    } else {
      findings.push(`Superheat is ${shStatus} and subcooling is ${scStatus}; no single common cause matches. Check airflow, load and metering device.`);
    }
    return { superheat: shStatus, subcooling: scStatus, findings };
  }

  // src/lib/readings.js
  function computeHydronic(i) {
    const supply = requireNumber(i.supplyF, "Supply temperature");
    const ret = requireNumber(i.returnF, "Return temperature");
    const gpmIn = parseNumber(i.gpm, "Flow (GPM)");
    const btuhIn = parseNumber(i.btuh, "Heat output (BTU/h)");
    const factor = parseNumber(i.factor, "Fluid factor") ?? WATER_FACTOR;
    const dt = deltaT(supply, ret);
    const target = { min: parseNumber(i.targetMin, "Target min"), max: parseNumber(i.targetMax, "Target max") };
    let gpm = gpmIn;
    let btuh;
    if (gpmIn !== void 0) btuh = heatOutputBtuh(gpmIn, dt, factor);
    else if (btuhIn !== void 0) {
      btuh = btuhIn;
      gpm = flowGpm(btuhIn, dt, factor);
    }
    return { deltaT: dt, gpm, btuh, assessment: assessDeltaT(dt, target) };
  }
  function computeReset(i) {
    const targetF = resetTarget({
      outdoorF: requireNumber(i.outdoorF, "Outdoor temperature"),
      outdoorDesignF: requireNumber(i.outdoorDesignF, "Design outdoor temperature"),
      supplyDesignF: requireNumber(i.supplyDesignF, "Design supply temperature"),
      roomF: parseNumber(i.roomF, "Room temperature") ?? 70,
      supplyMinF: parseNumber(i.supplyMinF, "Minimum supply"),
      supplyMaxF: parseNumber(i.supplyMaxF, "Maximum supply")
    });
    const measured = parseNumber(i.measuredF, "Measured supply");
    const tolerance = parseNumber(i.toleranceF, "Tolerance") ?? 5;
    return { targetF, check: measured === void 0 ? void 0 : assessSupply(measured, targetF, tolerance) };
  }
  function computeRefrigerant(tables, i) {
    const table = tables[i.refrigerant];
    if (!table) throw new RangeError(`Unknown refrigerant "${i.refrigerant}"`);
    const suctionPsig = parseNumber(i.suctionPsig, "Suction pressure");
    const suctionLineF = parseNumber(i.suctionLineF, "Suction line temperature");
    const liquidPsig = parseNumber(i.liquidPsig, "Liquid pressure");
    const liquidLineF = parseNumber(i.liquidLineF, "Liquid line temperature");
    const haveSuction = suctionPsig !== void 0 || suctionLineF !== void 0;
    const haveLiquid = liquidPsig !== void 0 || liquidLineF !== void 0;
    if (!haveSuction && !haveLiquid) throw new RangeError("Enter suction readings, liquid readings, or both");
    if (haveSuction && (suctionPsig === void 0 || suctionLineF === void 0)) {
      throw new RangeError("Enter both suction pressure and suction line temperature");
    }
    if (haveLiquid && (liquidPsig === void 0 || liquidLineF === void 0)) {
      throw new RangeError("Enter both liquid pressure and liquid line temperature");
    }
    const sh = haveSuction ? superheat(table, { suctionPsig, suctionLineF }) : void 0;
    const sc = haveLiquid ? subcooling(table, { liquidPsig, liquidLineF }) : void 0;
    const targets = {
      superheat: { min: parseNumber(i.shMin, "Superheat target min"), max: parseNumber(i.shMax, "Superheat target max") },
      subcooling: { min: parseNumber(i.scMin, "Subcooling target min"), max: parseNumber(i.scMax, "Subcooling target max") }
    };
    return { superheat: sh, subcooling: sc, interpretation: interpretCharge({ superheat: sh, subcooling: sc }, targets) };
  }

  // app/src/tabs/readings.js
  function field(name, label, hint) {
    return h(
      "label",
      { class: "field" },
      h("span", {}, label),
      h("input", { type: "text", inputmode: "decimal", name, autocomplete: "off" }),
      hint ? h("small", {}, hint) : null
    );
  }
  function card(title, note, rows, compute, show) {
    const out = h("div", { class: "result", role: "status", "aria-live": "polite" });
    const form = h(
      "form",
      {
        class: "card",
        onsubmit: (e) => {
          e.preventDefault();
          const values = Object.fromEntries(new FormData(form));
          clear(out);
          out.className = "result";
          try {
            show(out, compute(values));
          } catch (err) {
            out.className = "result error";
            out.append(err.message);
          }
        }
      },
      h("h2", {}, title),
      note ? h("p", { class: "empty" }, note) : null,
      ...rows.map((r) => h("div", { class: "row" }, r)),
      h("button", { type: "submit" }, "Calculate"),
      out
    );
    return form;
  }
  var line = (out, text) => out.append(h("div", {}, text));
  var list = (out, items) => out.append(h("ul", { class: "tight" }, items.map((t) => h("li", {}, t))));
  function hydronicCard() {
    return card("Hydronic delta-T and heat output", "Temperatures in F. Flow is optional. For glycol, enter the fluid factor (500 is for water).", [
      [field("supplyF", "Supply temperature (F)"), field("returnF", "Return temperature (F)"), field("gpm", "Flow (GPM)", "Optional")],
      [field("btuh", "Known heat output (BTU/h)", "Optional. Gives flow when Flow is blank"), field("factor", "Fluid factor", "Blank = 500 (water)")],
      [field("targetMin", "Target delta-T min (F)"), field("targetMax", "Target delta-T max (F)")]
    ], computeHydronic, (out, r) => {
      line(out, `Delta-T: ${r.deltaT} F`);
      if (r.btuh !== void 0) line(out, `Heat output: ${r.btuh.toLocaleString()} BTU/h`);
      if (r.gpm !== void 0) line(out, `Flow: ${r.gpm} GPM`);
      line(out, `Assessment: ${r.assessment.status}`);
      list(out, r.assessment.hints);
    });
  }
  function resetCard() {
    return card("Outdoor reset check", "Linear approximation only. Tekmar and other controls use their own curves: confirm against the curve table in the control manual.", [
      [field("outdoorF", "Outdoor temperature (F)"), field("roomF", "Room temperature (F)", "Blank = 70"), field("measuredF", "Measured supply (F)", "Optional")],
      [field("outdoorDesignF", "Design outdoor temperature (F)"), field("supplyDesignF", "Design supply temperature (F)"), field("supplyMinF", "Minimum supply (F)"), field("supplyMaxF", "Maximum supply (F)")],
      [field("toleranceF", "Tolerance (F)", "Blank = 5")]
    ], computeReset, (out, r) => {
      line(out, `Target supply: ${r.targetF} F`);
      if (r.check) line(out, `Measured is ${r.check.status} (${r.check.difference > 0 ? "+" : ""}${r.check.difference} F from target)`);
    });
  }
  function refrigerantCard(ctx) {
    const names = Object.keys(ctx.tables).sort();
    if (names.length === 0) {
      return h(
        "div",
        { class: "card" },
        h("h2", {}, "Superheat and subcooling"),
        h("p", { class: "empty" }, 'No refrigerant pressure-temperature tables are installed, so superheat and subcooling cannot be calculated. Generate them with "python build/gen-pt-tables.py" (needs CoolProp; see the README), then rebuild with "npm run build".')
      );
    }
    const select = h("select", { name: "refrigerant" }, names.map((n) => h("option", { value: n }, n)));
    return card("Superheat and subcooling", "Pressures in psig. Target ranges come from the unit data plate or manual; none are assumed. Refrigerant handling must follow the manufacturer procedure.", [
      [h("label", { class: "field" }, h("span", {}, "Refrigerant"), select)],
      [field("suctionPsig", "Suction pressure (psig)"), field("suctionLineF", "Suction line temperature (F)")],
      [field("liquidPsig", "Liquid pressure (psig)"), field("liquidLineF", "Liquid line temperature (F)")],
      [field("shMin", "Superheat target min (F)"), field("shMax", "Superheat target max (F)"), field("scMin", "Subcooling target min (F)"), field("scMax", "Subcooling target max (F)")]
    ], (v) => ({ result: computeRefrigerant(ctx.tables, v), refrigerant: v.refrigerant }), (out, { result: r, refrigerant }) => {
      if (r.superheat !== void 0) line(out, `Superheat: ${r.superheat} F (${r.interpretation.superheat})`);
      if (r.subcooling !== void 0) line(out, `Subcooling: ${r.subcooling} F (${r.interpretation.subcooling})`);
      list(out, r.interpretation.findings);
      const source = ctx.tables[refrigerant] && ctx.tables[refrigerant].source;
      if (source) line(out, `PT table source: ${source}`);
    });
  }
  function renderReadings(root, ctx) {
    root.append(hydronicCard(), resetCard(), refrigerantCard(ctx));
  }

  // src/lib/faultcodes.js
  var compact = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  var same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  function searchFaultCodes(entries, query, { manufacturer, model } = {}) {
    const pool = entries.filter(
      (e) => (!manufacturer || same(e.manufacturer, manufacturer)) && (!model || same(e.model, model))
    );
    const q = String(query || "").trim();
    const byOrder = (a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.model.localeCompare(b.model) || a.code.localeCompare(b.code, void 0, { numeric: true });
    if (!q) return [...pool].sort(byOrder);
    const qCode = compact(q);
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = [];
    for (const e of pool) {
      const code = compact(e.code);
      let score = 0;
      if (qCode && code === qCode) score = 100;
      else if (qCode && code.startsWith(qCode)) score = 50;
      else if (qCode && code.includes(qCode)) score = 30;
      if (score === 0) {
        const hay = [e.meaning, ...e.causes || [], ...e.checks || []].join(" ").toLowerCase();
        if (words.every((w) => hay.includes(w))) score = 10;
      }
      if (score > 0) scored.push({ e, score });
    }
    scored.sort((a, b) => b.score - a.score || byOrder(a.e, b.e));
    return scored.map((s) => s.e);
  }
  function listManufacturers(entries) {
    return [...new Set(entries.map((e) => e.manufacturer))].sort();
  }
  function listModels(entries, manufacturer) {
    const pool = manufacturer ? entries.filter((e) => same(e.manufacturer, manufacturer)) : entries;
    return [...new Set(pool.map((e) => e.model))].sort();
  }

  // app/src/tabs/faultcodes.js
  function renderFaultCodes(root, ctx) {
    const entries = ctx.data.faultCodes;
    if (entries.length === 0) {
      root.append(
        h(
          "div",
          { class: "card" },
          h("h2", {}, "Fault codes"),
          h("p", { class: "empty" }, "No fault codes have been added yet. Add entries to data/fault-codes/<manufacturer>.json (see the README), run npm run build, and reload.")
        )
      );
      return;
    }
    const results = h("div", { role: "status", "aria-live": "polite" });
    const input = h("input", { type: "search", placeholder: "Code or words, e.g. E-01 or sensor open", autocomplete: "off" });
    const mfr = h("select", { "aria-label": "Manufacturer" }, h("option", { value: "" }, "All manufacturers"), listManufacturers(entries).map((m) => h("option", { value: m }, m)));
    const model = h("select", { "aria-label": "Model" });
    const fillModels = () => {
      clear(model);
      model.append(h("option", { value: "" }, "All models"), ...listModels(entries, mfr.value || void 0).map((m) => h("option", { value: m }, m)));
    };
    const card2 = (e) => h(
      "div",
      { class: "card" },
      h("h2", {}, `${e.code}`, h("span", { class: "badge" }, `${e.manufacturer} ${e.model}`)),
      h("p", {}, e.meaning),
      e.causes.length ? h("div", {}, h("strong", {}, "Common causes"), h("ul", { class: "tight" }, e.causes.map((c) => h("li", {}, c)))) : null,
      e.checks.length ? h("div", {}, h("strong", {}, "Checks"), h("ul", { class: "tight" }, e.checks.map((c) => h("li", {}, c)))) : null,
      h("a", { href: pdfHref(e.source), target: "_blank", rel: "noopener" }, `Manual: ${e.source.doc}, page ${e.source.page}`)
    );
    const run = () => {
      clear(results);
      const hits = searchFaultCodes(entries, input.value, { manufacturer: mfr.value || void 0, model: model.value || void 0 });
      if (hits.length === 0) {
        results.append(h("p", { class: "empty" }, "No matching fault codes. Try the Manuals tab to search the full text."));
        return;
      }
      results.append(h("p", { class: "empty" }, `${hits.length} fault code${hits.length === 1 ? "" : "s"}`), ...hits.map(card2));
    };
    mfr.addEventListener("change", () => {
      fillModels();
      run();
    });
    model.addEventListener("change", run);
    input.addEventListener("input", run);
    fillModels();
    root.append(
      h(
        "div",
        { class: "card" },
        h("h2", {}, "Fault codes"),
        h("div", { class: "row" }, h("label", { class: "field" }, h("span", {}, "Code or keywords"), input), h("label", { class: "field" }, h("span", {}, "Manufacturer"), mfr), h("label", { class: "field" }, h("span", {}, "Model"), model))
      ),
      results
    );
    run();
    input.focus();
  }

  // app/src/main.js
  var TABS = [
    { id: "diagnose", label: "Diagnose", render: renderDiagnose },
    { id: "readings", label: "Readings", render: renderReadings },
    { id: "faultcodes", label: "Fault codes", render: renderFaultCodes },
    { id: "manuals", label: "Manuals", render: renderManuals }
  ];
  function boot() {
    const root = document.getElementById("app");
    const nav = document.getElementById("tabs");
    const data = window.HVAC_DATA;
    if (!data || !window.HVAC_INDEX) {
      clear(root);
      root.append(h("p", { class: "error", role: "alert" }, 'App data not found. Run "npm run build" in the project folder, then reload this page.'));
      return;
    }
    let ctx;
    try {
      ctx = { data, searchIndex: loadIndex(window.HVAC_INDEX), tables: buildTables(data.pt) };
    } catch (err) {
      clear(root);
      root.append(h("p", { class: "error", role: "alert" }, `Could not load app data: ${err.message}. Run "npm run build" again and reload this page.`));
      return;
    }
    const current = () => TABS.find((t) => `#${t.id}` === location.hash) || TABS[0];
    const show = () => {
      const tab = current();
      const navHadFocus = nav.contains(document.activeElement);
      let activeButton = null;
      clear(nav);
      for (const t of TABS) {
        const button = h("button", { type: "button", "aria-current": t.id === tab.id ? "page" : null, onclick: () => {
          location.hash = t.id;
        } }, t.label);
        if (t.id === tab.id) activeButton = button;
        nav.append(button);
      }
      clear(root);
      try {
        tab.render(root, ctx);
      } catch (err) {
        root.append(h("p", { class: "error", role: "alert" }, `This tab failed to load: ${err.message}`));
      }
      if (navHadFocus && activeButton) activeButton.focus();
    };
    window.addEventListener("hashchange", show);
    show();
  }
  boot();
})();
