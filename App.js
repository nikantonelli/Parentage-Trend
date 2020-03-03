
Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    config: {
        defaultSettings: {
            atDate: Ext.Date.format(Ext.Date.subtract(new Date(), Ext.Date.MONTH,12), "Y-m-d"),
            compareDate: Ext.Date.format(new Date(), "Y-m-d")
        }

    },
    items: [
        {
            xtype: 'container',
            itemId: 'option_box',
            layout: 'hbox'
        }
    ],

    _processResults: function(nodeTree) {
        debugger;
    },

    _drawGrid: function(results) {
        var store = this._processResults(results);
        if (this.down('#grid')) { this.down('grid').destroy();}

        var columns = [ { text: 'Type', dataIndex: 'type'} ];
        for (var i =1; i < this.types.length; i++) {
            columns.push ( { 
                text: "Percent to: " +this.types[i].name, 
                dataIndex: this.types[i].name, 
                flex: 1,
                renderer: function (value, metaData, record) {
                    return (record.get('total')? ((value/record.get('total'))*100): 0).toFixed(1);
                }
                });
        }
        columns.push({ text: 'Total', dataIndex: 'total' });
        this.add({
            xtype: 'grid',
            model: 'Niks.Tree.Record',
            store: store,
            columns: columns,
            height: 300,
            width: 800
        });

    },
    
    types: [],

    categories: [],
    series: [],


    _loadRecordTypeSnapshots: function( type, filters, date) {
        var localFilters = [];
        var model = 'PortfolioItem';

        // Split up the portfolio item name if
        if (type.typePath === 'HierarchicalRequirement')
        {
            model = type.typePath;
        }
        else {
            localFilters.push( {
                property: 'PortfolioItemType',
                operator: '=',
                value: Number(type.type)
            });
        }
        

        localFilters.push({
            property: '_TypeHierarchy',
            value: model
        });
        if (filters && filters.length > 0) { localFilters = localFilters.concat(filters);}
        return this._loadRecordSnapshots( localFilters, date);
    },

    _loadRecordSnapshots: function( filters, date) {
        var me = this;
        var deferred = Ext.create('Deft.Deferred');
        var localFilters = [
            {
                property: '__At',
                value: Ext.Date.format(date, "Y-m-d\\TH:i:s")
            },
            {
                property: '_ProjectHierarchy',
                value: me.getContext().getProject().ObjectID
            }
        ].concat(filters);
        Ext.create('Rally.data.lookback.SnapshotStore', {
            filters: localFilters,
            limit: Infinity,
            pageSize: 2000,
            fetch: ["_ValidFrom", "_ValidTo", "ObjectID", "Children", "Parent", "UserStories", me.types[1].name ]
        }).load({
            callback : function(records, operation, successful) {
                console.log('callback: ', records, operation, successful);
                if (successful){
                    console.log('Store fetched returned :', records.length);
                    deferred.resolve(records);
                } else {
                    console.log('Failed to fetch Snapshots: ', operation);
                    deferred.resolve([]);
                }
            }
        });
        return deferred.promise;

    },
    _getLowestLevelItems: function() {
        var lastType = this.types[0];
        return this._getOneLevelItems(lastType, []);
    },

    _getTopLevelItems: function() {
//        var lastType = this.types[1];
        var lastType = this.types[this.types.length-1];
        return this._getOneLevelItems(lastType, []);
    },

    _getOneLevelItems: function(type, filters) {
        var deferred = Ext.create('Deft.Deferred');
        this._loadRecordTypeSnapshots(type, filters, this.date).then({
            success: function(results) {
                deferred.resolve(results);
            }
        });
        return deferred.promise;
    },

    _getCollection: function(parent,childField) {
        var children = parent.get(childField);  //Gives back an array of ObjectIDs
        var filters = [{
            property: "_ItemHierarchy",
            operator: "in",
            value: children
        }];
        var parentField = (childField === "UserStories")?this.types[1].name: "Parent";
        filters.push({
            property: parentField,
            value: parent.get("ObjectID")
        });
        return this._loadRecordSnapshots( filters, this.date);
    },

    _getChildren: function(parent) {
        var me = this;
        var deferred = Ext.create('Deft.Deferred');
        var childField = (parent.get('PortfolioItemType') === Number(this.types[1].type))?"UserStories":"Children";

        if (parent.get(childField).length > 0) {
            this._getCollection(parent,childField).then( {
                success: function(records) {
                    console.log('Found :' + records.length + ' for: ', parent);                   
                    deferred.resolve(records);
                },
                failure: function(error){
                    console.log('Failed to fetch Collection: ', error);
                    deferred.reject(error);
                },
                scope: me
            });
        }
        else {
            console.log('No Children for: ', parent);
            deferred.resolve([]);
        }

        return deferred.promise;
    },

    _Items: {},

    _getNumbersForType: function(type) {
        var deferred = Ext.create('Deft.Deferred');
        this._getOneLevelItems(type,[], this.date).then({
            success: function(results) {
                deferred.resolve({
                    type: type,
                    results: results
                });
            },
            failure: function(error) {
                debugger;
                deferred.reject(error);
            }
        });
        return deferred.promise;
    },

    launch: function() {
        var me = this;
        me.date = new Date();
        var nodes = [];
        var nodeTree = null;

        this._fetchPortfolioItemTypes().then({
            success: function(types) {

                //It might make sense to add Defects here, but the numbers might seem
                //a little skewed because some defects are not meant to have a parent.
                types.splice(0,0, {
                    typePath: 'HierarchicalRequirement',
                    name: 'User Story',
                    parentType: types[0]
                });
                me.types = types;
                    
                var loopFunctions = [];

                /**
                 * From the 'n' level items, use _ItemHierarchy to find how many of each type there are in the tree below
                 * 
                 * So, firstly, we need the list of 'n' level items. For each one do the same for those we didn't get in the previous fetch
                 * For each location in the table, we need to get four numbers, startPercent, endPercent, percentAdded, percentRemoved
                 * 
                 * This is going to be hugely memory intensive unless we can do vertical stripes down through the tree. Each time we 
                 * have completed a top-to-bottom strip, we can discard the store(s) to reclaim memory. 
                 * 
                 * To do this vertical striping, we have to write this to recurse down before it traverses across.
                 */
                _.each(types, function(type) {
                    loopFunctions.push(function() { return me._getNumbersForType(type);});
                });

                 Deft.Chain.sequence(loopFunctions).then({
                    success: function(resultSets) {
                        //Now we have all the items in memory, we can re-create the tree in the way we need

                        _.each( resultSets, function(resultSet, idx) {  //Order of completion is guaranteed due to use of 'Deft.sequence'
                            var type = resultSet.type;
                           //Create nodes for each type for those without a parent
                            nodes.push({
                                id: idx,
                                type: type,
                                record: null,
                                total: resultSet.results.length
                            });

                            var results = resultSet.results;
                            _.each(results, function(result) {
                                nodes.push({
                                    id: result.get('ObjectID'),
                                    type: type,
                                    record: result
                                });
                            });
                        });
                        nodeTree = me._createNodeTree(nodes);
                        me._processResults(nodeTree);
                    },
                    failure: function(error) {
                        console.log('Failed to fetch sequence: ', error);
                        debugger;     //Not fussed what the error is, we can just ignore.
                    },
                    scope: me
                });


            },
            failure: function() {
                console.log('Failed to fetch portfolioitem types');
            },
            scope: me
        });
    },

    _getParentId: function(d) {
        if (d.type.typePath === "HierarchicalRequirement") {
            return d.record.get(this.types[1].name);
        }
        else {
            return d.record.get('Parent');
        }
    },

    _findParentNode: function(nodes, d) {
        var me = this;
        var parentId = me._getParentId(d);
        //If we have a normal parent Id, then return tht
        if (parentId > 0) {
            return parentId;
        }
        //If not, then give back the 'index'
        else {
            return _.findIndex(me.types, function(type) {
                return type.typePath === d.type.typePath;
            });
        }
    },

    _stratifyNodeTree: function(nodes) {
        var me = this;
        return d3.stratify()
        .id( function(d) {
            return d.id;
        })
        .parentId( function(d) {

            //Top level node is the one for the last portfolio item
            if (d.id === (me.types.length - 1)) { return null;}
            //If we are a real node, find the parent
            if ( d.record ) { 
                return me._findParentNode(nodes, d);
            }
            //If not, and we shouldn't get here for real nodes, then connect this to the root node
            else if (d.id < (me.types.length - 1)) {return d.id + 1;}
            else { return null;}
            
        })
        (nodes);
    },
    _sumNodeTree: function(tree, level) {
        tree.each( function(d) { d.value = 0;});
        return tree.sum(function(d) { 
            if (d.height >= level) {return 1;}
            else return 0;
        });
    },
    _createNodeTree: function (nodes) {
        //Try to use d3.stratify to create nodes
        var nodetree = this._stratifyNodeTree(nodes);
        this._nodeTree = this._sumNodeTree(nodetree,);      //Save for later
        return nodetree;
    },

    getSettingsFields: function() {
    
        return [
            {
                name: 'atDate',
                fieldLabel: 'Timestamp Date',
                xtype: 'rallydatefield',
                allowBlank: true,
                blankText: "Use todays date"
            },
            {
                name: 'compareDate',
                fieldLabel: 'Comparison Date',
                xtype: 'rallydatefield',
                allowBlank: true,
                blankText: "Use last years date"
            }
        ];
    },

    _fetchPortfolioItemTypes: function(){
        var deferred = Ext.create('Deft.Deferred');

        var store = Ext.create('Rally.data.wsapi.Store', {
            model: 'TypeDefinition',
            fetch: ['TypePath', 'Ordinal','Name'],
            filters: [
                {
                    property: 'Parent.Name',
                    operator: '=',
                    value: 'Portfolio Item'
                },
                {
                    property: 'Creatable',
                    operator: '=',
                    value: 'true'
                }
            ],
            sorters: [{
                property: 'Ordinal',
                direction: 'ASC'
            }]
        });
        store.load({
            callback: function(records, operation, success){

                if (success){
                    var portfolioItemTypes = new Array(records.length);
                    _.each(records, function(d){
                        //Use ordinal to make sure the lowest level portfolio item type is the first in the array.
                        var idx = Number(d.get('Ordinal'));
                        portfolioItemTypes[idx] = { typePath: d.get('TypePath'), name: d.get('Name'), type: d.get('_ref').split('/').pop() };
                        //portfolioItemTypes.reverse();
                    });
                    //Now add the parent type in
                    for (var i =0; i < (portfolioItemTypes.length-1); i++) {
                        portfolioItemTypes[i].parentType = portfolioItemTypes[i+1];
                    }
                    deferred.resolve(portfolioItemTypes);
                } else {
                    var error_msg = '';
                    if (operation && operation.error && operation.error.errors){
                        error_msg = operation.error.errors.join(',');
                    }
                    deferred.reject('Error loading Portfolio Item Types:  ' + error_msg);
                }
            }
        });
        return deferred.promise;
    }

});
