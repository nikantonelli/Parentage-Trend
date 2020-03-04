
Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    config: {
        defaultSettings: {
            atDate: Ext.Date.format(new Date(), "Y-m-d")
        }

    },
    items: [
        {
            xtype: 'container',
            itemId: 'option_box',
            layout: 'hbox'
        }
    ],

    _hasParent: function(child) {
        var fieldName = (child.type.typePath === 'HierarchicalRequirement') ? this.types[1].name : "Parent";
        return (child.record.get(fieldName) > 0)? _.find(this.nodes, function(parent) {
            return parent.record.get('ObjectID') === child.record.get(fieldName);}):null;
    },

    _hasChildren: function(node) {
        var childField = "Children";
        if (node.type.typePath === this.types[1].typePath) {
            childField = "UserStories";
        }
        return node.record.get(childField).length;
    },

    _findDepth: function(node) {
        var depth = -1;
        var item = node;
        do {
            item = this._hasParent(item);
            depth +=1;
        }while(item);
        return depth;
    },

    _processResults: function(resultSets) {
        var me = this;

        me._Items = [];

        _.each(me.types, function() {
            var arr1 = [];
            for (var i = 0; i < me.types.length; i++) {
                arr1.push(0);
            }
            me._Items.push(arr1);
        });
        me.nodes = [];
        _.each(resultSets, function(resultSet) {
            _.each(resultSet.results, function(record) {
                me.nodes.push({
                    type: resultSet.type,
                    record: record
                });
            });
        });

        _.each(me.nodes, function(node) {
            var idx = _.findIndex(me.types, function(type) {
                return type.typePath === node.type.typePath;
            });
            var depth = me._findDepth(node);
            for (var i = depth; i >= 0; i--){
                me._Items[idx][ idx + i ] +=1;
            }
        });

        for ( var j = 0; j < (me.types.length-1); j++) {
            for ( var i = j+1; i < (me.types.length ); i++) {
                if (me._Items[j][j] > 0) {
                    me._Items[j][i] = ((me._Items[j][i]/me._Items[j][j])*100);
                }
            }
        }

        // Create the record type
        var fields = [
            { name: 'type', type: 'string' },
            { name: 'total', type: 'int'}
        ];
        _.each( Ext.clone(this.types).reverse(), function( type) {
            fields.push({ name: type.name, type: 'float'});
        });

        Ext.define('Niks.Tree.Record', {
            extend: 'Ext.data.Model',
            fields: fields,
            isUpdatable: function() { return false;},
            isTimebox: function() { return false;},
            isUser: function() { return false;},
            isMilestone: function() { return false;},
        });

        var data = [];

        _.each(me._Items, function(resultArray, idx) {
            var record = _.find(data, { type: me.types[idx].name});
            if ( !record) {
                data.push( { type: me.types[idx].name, total: me._Items[idx][idx]});
                record = _.find(data, { type: me.types[idx].name});
            }
            for (var i = idx+1; i < (me.types.length); i++) {
                record[me.types[i].name] = me._Items[idx][i];
            }
        });
        var store = Ext.create('Ext.data.Store', {
            model: 'Niks.Tree.Record',
            data: data
        });

        return store;
    },

    _drawGrid: function(atStore) {
        if (this.down('#grid')) { this.down('#grid').destroy();}

        var columns = [ { text: 'Type', dataIndex: 'type'} ];
        for (var i =1; i < this.types.length; i++) {
            columns.push ( { 
                text: "Percent to: " +this.types[i].name, 
                dataIndex: this.types[i].name, 
                flex: 1,
                renderer: function(value) { return value.toFixed(1);}
                });
        }
        columns.push({ text: 'Total', dataIndex: 'total' });
        this.add({
            xtype: 'grid',
            model: 'Niks.Tree.Record',
            store: atStore,
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
            useHttpPost: true,
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

    _Items: [],

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
                console.log("Failed to getOneLevelItems for: ", type);
                deferred.reject(error);
            }
        });
        return deferred.promise;
    },

    launch: function() {
        var me = this;
        me.date = new Date(me.getSetting('atDate'));    //Externally, we don't get a setting so add an OR to get a real date for testing

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

                me.setLoading(" Fetching data for: " + Ext.Date.format(me.date, 'Y/m/d'));
                Deft.Chain.sequence(loopFunctions).then({
                    success: function(resultSets) { //Must arrive in order from hierarchicalrequirement up to top kevel pi
                        var atStore = me._processResults(resultSets);
                        me._drawGrid(atStore); 
                    },
                    failure: function(error) {
                        console.log('Failed to fetch sequence: ', error);
                    },
                    scope: me
                }).always(function() { me.setLoading(false); });


            },
            failure: function() {
                console.log('Failed to fetch portfolioitem types');
            },
            scope: me
        }).always(function() { me.setLoading(false); });
    },

    _getParentId: function(d) {
        if (d.type.typePath === "HierarchicalRequirement") {
            return d.record.get(this.types[1].name);
        }
        else {
            return d.record.get('Parent');
        }
    },

    getSettingsFields: function() {
    
        return [
            {
                name: 'atDate',
                fieldLabel: 'Use data as of:',
                xtype: 'rallydatefield',
                allowBlank: true,
                blankText: "Use todays date",
                margin: '0 0 150 0'
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
