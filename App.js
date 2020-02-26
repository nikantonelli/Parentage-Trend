Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    config: {
        defaultSettings: {
            startDate: Ext.Date.format(Ext.Date.subtract(new Date(), Ext.Date.MONTH,12), "Y-m-d"),
            endDate: Ext.Date.format(new Date(), "Y-m-d")
        }

    },
    items: [
        {
            xtype: 'container',
            itemId: 'option_box',
            layout: 'hbox'
        }
    ],

    _processResults: function(results) {
        var me = this;
        // Create the record type
        var fields = [
            { name: 'type', type: 'string' },
            { name: 'total', type: 'int'}
        ];
        _.each( Ext.clone(this.types).reverse(), function( type) {
            fields.push({ name: type.name, type: 'int'});
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
                name: 'startDate',
                fieldLabel: 'Start Date',
                xtype: 'rallydatefield'
            },
            {
                name: 'endDate',
                fieldLabel: 'End Date',
                xtype: 'rallydatefield'
            }
        ];
    },

    _loadRecordCount: function(model, filters){
        var deferred = Ext.create('Deft.Deferred');
        var startDate = this.getSetting('startDate');
        var endDate = this.getSetting('endDate');
        console.log("Starting load: ",startDate,endDate, " >> ",model, 'filters >> ', filters);
        var localFilterString = "((CreationDate >" + startDate + ") AND (CreationDate <" + endDate + "))";
        var localFilters = Rally.data.wsapi.Filter.fromQueryString(localFilterString);
        if (filters) {
            localFilters = Rally.data.wsapi.Filter.and([
                Rally.data.wsapi.Filter.fromQueryString(filters?filters:'()'),
                localFilters
            ]);
        }

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
