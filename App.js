Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    config: {
        defaultSettings: {
            periodName: 'Week',
            periodCount: 12,
            endDate: new Date()
        }

    },
    items: [
        {
            xtype: 'container',
            itemId: 'option_box',
            layout: 'hbox'
        }
    ],

//     _getParents: function(date) {
//         var parents = Ext.create('Deft.Deferred');
//         var promises = [];
//         _.each(this.types, function(type) {
//             promises.push( function(){
//                 var deferred = Ext.create('Deft.Deferred');
//                 var filters = null;
//                 if (type.typePath === 'HierarchicalRequirement') {
//                     //With userstories, you can ask for the field which is the name of the first level portfolio item and 
//                     //this field is cascaded down the userstory child hierarchy. So rather than asking for Parent or PortfolioItem,
//                     //we ask for 'Feature' (or whatever it is called), we can ignore the parent-child userstory tree.
//                     filters = { property: type.parentType.name, operator: '>', value: 0 };
//                 }
//                 else {
//                     filters = { property: 'Parent', operator: '>', value: 0 };
//                 }

//                 this._loadRecordCount(type.typePath, Ext.clone(filters), type.name, date).then({
//                     success: function(result) {
// //                        me.parented.push(result);
//                         deferred.resolve(result);
//                     },
//                     failure: function(result) {
//                         console.log('Failed: ', result);
//                         deferred.reject(result);
//                     }
//                 });
//                 return deferred.promise;
//             });
//         }, this);
//         Deft.Chain.parallel(promises, this).then({
//             success: function(results) {
//                 var pointParents = {};
//                 _.each(results, function(result) {
//                     pointParents = Ext.merge(pointParents,result);
//                 });
//                 parents.resolve(pointParents);
//             },
//             failure: function(results) {
//                 console.log('GetTotals Failed: ', results);
//                 parents.reject(results);
//             }
//         });
//         return parents;

//     },

//     _getTotals: function(date) {
//         var totals = Ext.create('Deft.Deferred');
//         var promises = [];
//         _.each(this.types, function(type) {
//             promises.push( function(){
//                 var deferred = Ext.create('Deft.Deferred');
//                 this._loadRecordCount(type.typePath, { property: 'ObjectID', operator: '>', value: 0}, type.name, date).then({
//                     success: function(result) {
// //                        me.totals.push(result);
//                         deferred.resolve(result);
//                     },
//                     failure: function(result) {
//                         console.log('Failed: ', result);
//                         deferred.reject(result);
//                     }
//                 });
//                 return deferred.promise;
//             });
//         }, this);
//         Deft.Chain.parallel(promises, this).then({
//             success: function(results) {
//                 var pointTotals = {};
//                 _.each(results, function(result) {
//                     pointTotals = Ext.merge(pointTotals,result);
//                 });
//                 totals.resolve(pointTotals);
//             },
//             failure: function(results) {
//                 console.log('GetTotals Failed: ', results);
//                 totals.reject(results);
//             }
//         });
//         return totals;
//     },

    _processResults: function(results) {
        var me = this;
        // Create the record type
        var fields = [
            { name: 'type', type: 'string' },
            { name: 'total', type: 'int'}
        ];
        _.each( Ext.clone(this.types).reverse(), function( type) {
            fields.push({ name: type.name.replace(/\s+/g, ''), type: 'int'});
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

        _.each(results, function(result) {
            var record = _.find(data, { type: me.types[result.y].name});
            if ( !record) {
                if (result.x === result.y) {
                    data.push( { type: me.types[result.y].name, total: result.count});
                }
                else {
                    var newRecord = { type: me.types[result.y].name };
                    newRecord[me.types[result.x].name] = result.count;
                    data.push( newRecord);
                }
            }
            else {
                record[me.types[result.x].name] = result.count;
            }
        });
        var store = Ext.create('Ext.data.Store', {
            model: 'Niks.Tree.Record',
            data: data
        });

        return store;
    },

    _drawGrid: function(results) {
        var store = this._processResults(results);
        if (this.down('#grid')) { this.down('grid').destroy();}

        var columns = [ { text: 'Type', dataIndex: 'type'} ];
        for (var i =1; i < this.types.length; i++) {
            columns.push ( { text: "Up to: " +this.types[i].name, dataIndex: this.types[i].name, flex: 1});
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

    _getData: function(item) {
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        this._loadRecordCount( item.type.typePath, item.parentField?('('+item.parentField+' >0)'):null, item.x, item.y).then ({
            success: function(result) {
                deferred.resolve({
                    x: item.x,
                    y: item.y,
                    count: result
                });
            },
            failure: function(result) {
                console.log('Totals Failed: ',result);
                deferred.reject(result);
            },
            scope: me
        });
        
        return deferred.promise;
    },

    launch: function() {
        var me = this;
        this._fetchPortfolioItemTypes().then({
            success: function(types) {

                //Take off the top level as it always has no parent
//                types.pop();
                //It might make sense to add Defects here, but the numbers might seem
                //a little skewed because some defects are not meant to have a parent.
                types.splice(0,0, {
                    typePath: 'HierarchicalRequirement',
                    name: 'User Story',
                    parentType: types[0]
                });
                me.types = types;
                
                _.each(types, function(type) {
                    me.series.push( {
                        name : type.name,
                        data: []
                    });
                });
                
                var loopFunctions = [];
                /** [ { type: 'UserStory', field: 'Feature.ObjectID'}] 
                    [ { type: 'UserStory', field: 'Feature.Parent.ObjectID'},               { type: 'Feature',   field: 'Parent.ObjectID' }] 
                    [ { type: 'UserStory', field: 'Feature.Parent.Parent.ObjectID'},        { type: 'Feature',   field: 'Parent.Parent.ObjectID' },         { type: 'BusinessOutcome',   field: 'Parent.ObjectID' }  ] 
                    [ { type: 'UserStory', field: 'Feature.Parent.Parent.Parent.ObjectID'}, { type: 'Feature',   field: 'Parent.Parent.Parent.ObjectID' },  { type: 'BusinessOutcome',   field: 'Parent.Parent.ObjectID' } , { type: 'PortfolioObjective',   field: 'Parent.ObjectID' }  ] 
                */

                _.each( types, function( type, idx ) {
                    var parentField = 'Parent';
                    if (type.typePath === 'HierarchicalRequirement') {
                        parentField = types[1].name;
                    }
                    console.log({ 'type': type, 'x': types.length - (idx+1), 'y': types.length - (idx+1), 'parentField': null});
                    loopFunctions.push(function() {
                        return me._getData(Ext.clone({ 'type': type, 'x': idx, 'y': idx, 'parentField': null}));
                    });
                    var cmdArr = [];
                    for (var i = (idx+1); i < types.length; i++) {
                        var cmd = { 'type': type, 'x': i, 'y': idx, 'parentField': parentField + '.ObjectID'};
                        cmdArr.push(cmd );
                        console.log( cmd);
                        parentField += '.Parent';
                    }

                    _.each(cmdArr, function(cmd) {
                        loopFunctions.push(function() {
                            return me._getData(Ext.clone(cmd));
                        });
                    });
                });
                Deft.Chain.parallel(loopFunctions).then ({
                    success: function(results){
                        me._drawGrid(results);
                    },
                    failure: function(result) {
                        console.log('Failed to execute loop: ', result);
                    }
                }).always(function() {
                    me.setLoading(false);
                });

            },
            failure: function() {
                console.log('Failed to fetch portfolioitem types');
            },
            scope: me
        });
    },

    getSettingsFields: function() {
    
        return [
            {
                name: 'periodName',
                fieldLabel: 'Period Type',
                xtype: 'rallycombobox',
                allowBlank: false,
                autoSelect: true,
                initialValue: 'Week',
                displayField: 'name',
                valueField: 'name',
                storeType: 'Ext.data.Store',
                storeConfig: {
                    remoteFilter: false,
                    fields: ['name'],
                    data: [
                        { 'name': 'Day'},
                        { 'name': 'Week'},
                        { 'name': 'Fortnight'},
                        { 'name': 'Month'},
                        { 'name': 'Quarter'}
                    ],
                },
            },
            {
                name: 'periodCount',
                xtype: 'rallynumberfield',
                minValue: 3,
                maxValue: 32,
                fieldLabel: 'Period Count',
                value: 1
            },
            {
                name: 'endDate',
                fieldLabel: 'End Date',
                xtype: 'rallydatefield'
            }
        ];
    },

    _loadRecordCount: function(model, filters, x, y){
        var deferred = Ext.create('Deft.Deferred');
        console.log("Starting load: ",x,y, " >> ",model, 'filters >> ', filters);

        var localFilters = filters?Rally.data.wsapi.Filter.fromQueryString(filters):[];
        Ext.create('Rally.data.wsapi.Store', {
            model: model.toLowerCase(),
            filters: localFilters,
            limit: 1,
            pageSize: 1
        }).load({
            callback : function(records, operation, successful) {
                if (successful){
                    console.log('result:', operation);
                    deferred.resolve(operation.resultSet.totalRecords || 0);
                } else {
                    console.log("Failed: ", operation);
                    deferred.resolve(0);
                    //deferred.reject("Couldn't Load: " + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
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
                        portfolioItemTypes[idx] = { typePath: d.get('TypePath'), name: d.get('Name') };
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
