'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _trimEnd = require('lodash/trimEnd');

var _trimEnd2 = _interopRequireDefault(_trimEnd);

var _tokenTypes = require('./tokenTypes');

var _tokenTypes2 = _interopRequireDefault(_tokenTypes);

var _Indentation = require('./Indentation');

var _Indentation2 = _interopRequireDefault(_Indentation);

var _InlineBlock = require('./InlineBlock');

var _InlineBlock2 = _interopRequireDefault(_InlineBlock);

var _Params = require('./Params');

var _Params2 = _interopRequireDefault(_Params);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class Formatter {
  /**
   * @param {Object} cfg
   *   @param {Object} cfg.indent
   *   @param {Object} cfg.params
   * @param {Tokenizer} tokenizer
   */
  constructor(cfg, tokenizer) {
    this.cfg = cfg || {};
    this.indentation = new _Indentation2.default(this.cfg.indent);
    this.inlineBlock = new _InlineBlock2.default();
    this.params = new _Params2.default(this.cfg.params);
    this.tokenizer = tokenizer;
    this.previousReservedWord = {};
  }

  /**
   * Formats whitespaces in a SQL string to make it easier to read.
   *
   * @param {String} query The SQL query string
   * @return {String} formatted query
   */
  format(query) {
    const tokens = this.tokenizer.tokenize(query);
    const formattedQuery = this.getFormattedQueryFromTokens(tokens);

    return formattedQuery.trim();
  }

  getFormattedQueryFromTokens(tokens) {
    let formattedQuery = '';

    tokens.forEach((token, index) => {
      if (token.type === _tokenTypes2.default.WHITESPACE) {} else if (token.type === _tokenTypes2.default.LINE_COMMENT) {
        formattedQuery = this.formatLineComment(token, formattedQuery);
      } else if (token.type === _tokenTypes2.default.BLOCK_COMMENT) {
        formattedQuery = this.formatBlockComment(token, formattedQuery);
      } else if (token.type === _tokenTypes2.default.RESERVED_TOPLEVEL) {
        formattedQuery = this.formatToplevelReservedWord(token, formattedQuery);
        this.previousReservedWord = token;
      } else if (token.type === _tokenTypes2.default.RESERVED_NEWLINE) {
        formattedQuery = this.formatNewlineReservedWord(token, formattedQuery);
        this.previousReservedWord = token;
      } else if (token.type === _tokenTypes2.default.RESERVED) {
        formattedQuery = this.formatWithSpaces(token, formattedQuery);
        this.previousReservedWord = token;
      } else if (token.type === _tokenTypes2.default.OPEN_PAREN) {
        formattedQuery = this.formatOpeningParentheses(tokens, index, formattedQuery);
      } else if (token.type === _tokenTypes2.default.CLOSE_PAREN) {
        formattedQuery = this.formatClosingParentheses(token, formattedQuery);
      } else if (token.type === _tokenTypes2.default.PLACEHOLDER) {
        formattedQuery = this.formatPlaceholder(token, formattedQuery);
      } else if (token.value === ',') {
        formattedQuery = this.formatComma(token, formattedQuery);
      } else if (token.value === ':') {
        formattedQuery = this.formatWithSpaceAfter(token, formattedQuery);
      } else if (token.value === '.' || token.value === ';') {
        formattedQuery = this.formatWithoutSpaces(token, formattedQuery);
      } else {
        formattedQuery = this.formatWithSpaces(token, formattedQuery);
      }
    });
    return formattedQuery;
  }

  formatLineComment(token, query) {
    return this.addNewline(query + token.value);
  }

  formatBlockComment(token, query) {
    return this.addNewline(this.addNewline(query) + this.indentComment(token.value));
  }

  indentComment(comment) {
    return comment.replace(/\n/g, `\n${this.indentation.getIndent()}`);
  }

  formatToplevelReservedWord(token, query) {
    this.indentation.decreaseTopLevel();

    query = this.addNewline(query);

    this.indentation.increaseToplevel();

    query += this.equalizeWhitespace(token.value);
    return this.addNewline(query);
  }

  formatNewlineReservedWord(token, query) {
    return `${this.addNewline(query) + this.equalizeWhitespace(token.value)} `;
  }

  // Replace any sequence of whitespace characters with single space
  equalizeWhitespace(string) {
    return string.replace(/\s+/g, ' ');
  }

  // Opening parentheses increase the block indent level and start a new line
  formatOpeningParentheses(tokens, index, query) {
    // Take out the preceding space unless there was whitespace there in the original query or another opening parens
    const previousToken = tokens[index - 1];
    if (previousToken && previousToken.type !== _tokenTypes2.default.WHITESPACE && previousToken.type !== _tokenTypes2.default.OPEN_PAREN) {
      query = (0, _trimEnd2.default)(query);
    }
    query += tokens[index].value;

    this.inlineBlock.beginIfPossible(tokens, index);

    if (!this.inlineBlock.isActive()) {
      this.indentation.increaseBlockLevel();
      query = this.addNewline(query);
    }
    return query;
  }

  // Closing parentheses decrease the block indent level
  formatClosingParentheses(token, query) {
    if (this.inlineBlock.isActive()) {
      this.inlineBlock.end();
      return this.formatWithSpaceAfter(token, query);
    }

    this.indentation.decreaseBlockLevel();
    return this.formatWithSpaces(token, this.addNewline(query));
  }

  formatPlaceholder(token, query) {
    return `${query + this.params.get(token)} `;
  }

  // Commas start a new line (unless within inline parentheses or SQL "LIMIT" clause)
  formatComma(token, query) {
    query = `${(0, _trimEnd2.default)(query) + token.value} `;

    if (this.inlineBlock.isActive()) {
      return query;
    } else if (/^LIMIT$/i.test(this.previousReservedWord.value)) {
      return query;
    }

    return this.addNewline(query);
  }

  formatWithSpaceAfter(token, query) {
    return `${(0, _trimEnd2.default)(query) + token.value} `;
  }

  formatWithoutSpaces(token, query) {
    return (0, _trimEnd2.default)(query) + token.value;
  }

  formatWithSpaces(token, query) {
    return `${query + token.value} `;
  }

  addNewline(query) {
    return `${(0, _trimEnd2.default)(query)}\n${this.indentation.getIndent()}`;
  }
}
exports.default = Formatter;
//# sourceMappingURL=Formatter.js.map