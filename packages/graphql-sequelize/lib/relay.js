'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NodeTypeMapper = undefined;

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

exports.idFetcher = idFetcher;
exports.typeResolver = typeResolver;
exports.isConnection = isConnection;
exports.handleConnection = handleConnection;
exports.sequelizeNodeInterface = sequelizeNodeInterface;
exports.nodeType = nodeType;
exports.sequelizeConnection = sequelizeConnection;

var _graphqlRelay = require('graphql-relay');

var _graphql = require('graphql');

var _base = require('./base64.js');

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _simplifyAST = require('./simplifyAST');

var _simplifyAST2 = _interopRequireDefault(_simplifyAST);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

class NodeTypeMapper {
  constructor() {
    this.map = {};
  }

  mapTypes(types) {
    Object.keys(types).forEach(k => {
      let v = types[k];
      this.map[k] = v.type ? v : { type: v };
    });
  }

  item(type) {
    return this.map[type];
  }
}

exports.NodeTypeMapper = NodeTypeMapper;
function idFetcher(sequelize, nodeTypeMapper) {
  return (() => {
    var _ref = _asyncToGenerator(function* (globalId, context) {
      const { type, id } = (0, _graphqlRelay.fromGlobalId)(globalId);

      const nodeType = nodeTypeMapper.item(type);
      if (nodeType && typeof nodeType.resolve === 'function') {
        const res = yield Promise.resolve(nodeType.resolve(globalId, context));
        if (res) res.__graphqlType__ = type;
        return res;
      }

      const model = Object.keys(sequelize.models).find(function (model) {
        return model === type;
      });
      return model ? sequelize.models[model].findById(id) : nodeType ? nodeType.type : null;
    });

    return function (_x, _x2) {
      return _ref.apply(this, arguments);
    };
  })();
}

function typeResolver(nodeTypeMapper) {
  return obj => {
    var type = obj.__graphqlType__ || (obj.Model ? obj.Model.options.name.singular : obj._modelOptions ? obj._modelOptions.name.singular : obj.name);

    if (!type) {
      throw new Error(`Unable to determine type of ${typeof obj}. ` + `Either specify a resolve function in 'NodeTypeMapper' object, or specify '__graphqlType__' property on object.`);
    }

    const nodeType = nodeTypeMapper.item(type);
    return nodeType && nodeType.type || null;
  };
}

function isConnection(type) {
  return typeof type.name !== 'undefined' && type.name.endsWith('Connection');
}

function handleConnection(values, args) {
  return (0, _graphqlRelay.connectionFromArray)(values, args);
}

function sequelizeNodeInterface(sequelize) {
  let nodeTypeMapper = new NodeTypeMapper();
  const nodeObjects = (0, _graphqlRelay.nodeDefinitions)(idFetcher(sequelize, nodeTypeMapper), typeResolver(nodeTypeMapper));

  return _extends({
    nodeTypeMapper
  }, nodeObjects);
}

function nodeType(connectionType) {
  return connectionType._fields.edges.type.ofType._fields.node.type;
}

function sequelizeConnection({
  name,
  nodeType,
  target: targetMaybeThunk,
  orderBy: orderByEnum,
  before,
  after,
  connectionFields,
  edgeFields,
  where
}) {
  const {
    edgeType,
    connectionType
  } = (0, _graphqlRelay.connectionDefinitions)({
    name,
    nodeType,
    connectionFields,
    edgeFields
  });

  const SEPERATOR = '$';
  const PREFIX = 'arrayconnection' + SEPERATOR;

  before = before || (options => options);
  after = after || (result => result);

  let $connectionArgs = _extends({}, _graphqlRelay.connectionArgs);

  if (orderByEnum) {
    $connectionArgs.orderBy = {
      type: new _graphql.GraphQLList(orderByEnum)
    };
  }

  let orderByAttribute = function (orderAttr, { source, args, context, info }) {
    return typeof orderAttr === 'function' ? orderAttr(source, args, context, info) : orderAttr;
  };

  let orderByDirection = function (orderDirection, args) {
    if (args.last) {
      return orderDirection.indexOf('ASC') >= 0 ? orderDirection.replace('ASC', 'DESC') : orderDirection.replace('DESC', 'ASC');
    }
    return orderDirection;
  };

  /**
   * Creates a cursor given a item returned from the Database
   * @param  {Object}   item   sequelize model instance
   * @param  {Integer}  index  the index of this item within the results, 0 indexed
   * @return {String}          The Base64 encoded cursor string
   */
  let toCursor = function (item, index) {
    let id = item.get(item.constructor ? item.constructor.primaryKeyAttribute : item.Model.primaryKeyAttribute);
    return (0, _base.base64)(PREFIX + id + SEPERATOR + index);
  };

  /**
   * Decode a cursor into its component parts
   * @param  {String} cursor Base64 encoded cursor
   * @return {Object}        Object containing ID and index
   */
  let fromCursor = function (cursor) {
    cursor = (0, _base.unbase64)(cursor);
    cursor = cursor.substring(PREFIX.length, cursor.length);
    let [id, index] = cursor.split(SEPERATOR);

    return {
      id,
      index
    };
  };

  let argsToWhere = function (args) {
    let result = {};

    if (where === undefined) return result;

    _lodash2.default.each(args, (value, key) => {
      if (key in $connectionArgs) return;
      _lodash2.default.assign(result, where(key, value, result));
    });

    return result;
  };

  let resolveEdge = function (item, index, queriedCursor, args = {}, source) {
    let startIndex = null;
    if (queriedCursor) startIndex = Number(queriedCursor.index);
    if (startIndex !== null) {
      startIndex++;
    } else {
      startIndex = 0;
    }

    return {
      cursor: toCursor(item, index + startIndex),
      node: item,
      source: source
    };
  };

  let $resolver = require('./resolver')(targetMaybeThunk, {
    handleConnection: false,
    list: true,
    before: function (options, args, context, info) {
      const target = info.target;
      const model = target.target ? target.target : target;

      if (args.first || args.last) {
        options.limit = parseInt(args.first || args.last, 10);
      }

      let orderBy = args.orderBy ? args.orderBy : orderByEnum ? [orderByEnum._values[0].value] : [[model.primaryKeyAttribute, 'ASC']];

      if (orderByEnum && typeof orderBy === 'string') {
        orderBy = [orderByEnum._nameLookup[args.orderBy].value];
      }

      let orderAttribute = orderByAttribute(orderBy[0][0], {
        source: info.source,
        args,
        context,
        info
      });
      let orderDirection = orderByDirection(orderBy[0][1], args);

      options.order = [[orderAttribute, orderDirection]];

      if (orderAttribute !== model.primaryKeyAttribute) {
        options.order.push([model.primaryKeyAttribute, orderByDirection('ASC', args)]);
      }

      if (typeof orderAttribute === 'string') {
        options.attributes.push(orderAttribute);
      }

      if (options.limit && !options.attributes.some(attribute => attribute.length === 2 && attribute[1] === 'full_count')) {
        if (model.sequelize.dialect.name === 'postgres') {
          options.attributes.push([model.sequelize.literal('COUNT(*) OVER()'), 'full_count']);
        } else if (model.sequelize.dialect.name === 'mssql') {
          options.attributes.push([model.sequelize.literal('COUNT(1) OVER()'), 'full_count']);
        }
      }

      options.where = argsToWhere(args);

      if (args.after || args.before) {
        let cursor = fromCursor(args.after || args.before);
        let startIndex = Number(cursor.index);

        if (startIndex >= 0) options.offset = startIndex + 1;
      }
      options.attributes = _lodash2.default.uniq(options.attributes);
      return before(options, args, context, info);
    },
    after: (() => {
      var _ref2 = _asyncToGenerator(function* (values, args, context, info) {
        const {
          source,
          target
        } = info;

        var cursor = null;

        if (args.after || args.before) {
          cursor = fromCursor(args.after || args.before);
        }

        let edges = values.map(function (value, idx) {
          return resolveEdge(value, idx, cursor, args, source);
        });

        let firstEdge = edges[0];
        let lastEdge = edges[edges.length - 1];
        let fullCount = values[0] && values[0].dataValues.full_count && parseInt(values[0].dataValues.full_count, 10);

        if (!values[0]) {
          fullCount = 0;
        }

        if ((args.first || args.last) && (fullCount === null || fullCount === undefined)) {
          // In case of `OVER()` is not available, we need to get the full count from a second query.
          const options = yield Promise.resolve(before({
            where: argsToWhere(args)
          }, args, context, info));

          if (target.count) {
            if (target.associationType) {
              fullCount = yield target.count(source, options);
            } else {
              fullCount = yield target.count(options);
            }
          } else {
            fullCount = yield target.manyFromSource.count(source, options);
          }
        }

        let hasNextPage = false;
        let hasPreviousPage = false;
        if (args.first || args.last) {
          const count = parseInt(args.first || args.last, 10);
          let index = cursor ? Number(cursor.index) : null;
          if (index !== null) {
            index++;
          } else {
            index = 0;
          }

          hasNextPage = index + 1 + count <= fullCount;
          hasPreviousPage = index - count >= 0;

          if (args.last) {
            [hasNextPage, hasPreviousPage] = [hasPreviousPage, hasNextPage];
          }
        }

        return after({
          source,
          args,
          where: argsToWhere(args),
          edges,
          pageInfo: {
            startCursor: firstEdge ? firstEdge.cursor : null,
            endCursor: lastEdge ? lastEdge.cursor : null,
            hasNextPage: hasNextPage,
            hasPreviousPage: hasPreviousPage
          },
          fullCount
        }, args, context, info);
      });

      return function after(_x3, _x4, _x5, _x6) {
        return _ref2.apply(this, arguments);
      };
    })()
  });

  let resolver = (source, args, context, info) => {
    var fieldNodes = info.fieldASTs || info.fieldNodes;
    if ((0, _simplifyAST2.default)(fieldNodes[0], info).fields.edges) {
      return $resolver(source, args, context, info);
    }

    return after({
      source,
      args,
      where: argsToWhere(args)
    }, args, context, info);
  };

  return {
    connectionType,
    edgeType,
    nodeType,
    resolveEdge,
    connectionArgs: $connectionArgs,
    resolve: resolver
  };
}
//# sourceMappingURL=relay.js.map