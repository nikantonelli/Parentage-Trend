Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    config: {
        defaultSettings: {
            periodName: 'Day',
            periodCount: 32,
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

    _getParents: function() {
        var me = this;
        var parents = Ext.create('Deft.Deferred');
        var promises = [];
        _.each(this.types, function(type) {
            promises.push( function(){
                var deferred = Ext.create('Deft.Deferred');
                var filters = null;
                if (type.typePath === 'hierarchicalrequirement') {
                    //With userstories, you can ask for the field which is the name of the first level portfolio item and 
                    //tis field is cascaded down the userstory child hierarchy. So rather than asking for Parent or PortfolioItem,
                    //we ask for 'Feature' (or whatever it is called), we can ignore the parent-child userstory tree.
                    filters = Rally.data.wsapi.Filter.fromQueryString('('+type.parentType.name + '.ObjectID >0)');
                }
                else {
                    filters = Rally.data.wsapi.Filter.fromQueryString('(Parent.ObjectID >0)')
                }

                this._loadRecordCount(type.typePath, filters, type.name).then({
                    success: function(result) {
                        me.parented.push(result);
                        deferred.resolve(result);
                    },
                    failure: function(result) {
                        console.log('Failed: ', result);
                        deferred.reject(result);
                    }
                });
                return deferred.promise;
            });
        }, this);
        Deft.Chain.parallel(promises, this).then({
            success: function(results) {
                parents.resolve(results);
            },
            failure: function(results) {
                console.log('GetTotals Failed: ', results);
                parents.reject(results);
            }
        })
        return parents;

    },

    _getTotals: function() {
        var me = this;
        var totals = Ext.create('Deft.Deferred');
        var promises = [];
        _.each(this.types, function(type) {
            promises.push( function(){
                var deferred = Ext.create('Deft.Deferred');
                this._loadRecordCount(type.typePath, Rally.data.wsapi.Filter.fromQueryString('(ObjectID >0)'), type.name).then({
                    success: function(result) {
                        me.totals.push(result);
                        deferred.resolve(result);
                    },
                    failure: function(result) {
                        console.log('Failed: ', result);
                        deferred.reject(result);
                    }
                });
                return deferred.promise;
            });
        }, this);
        Deft.Chain.parallel(promises, this).then({
            success: function(results) {
                totals.resolve(results);
            },
            failure: function(results) {
                console.log('GetTotals Failed: ', results);
                totals.reject(results);
            }
        })
        return totals;
    },

    _updateChart: function() {
        debugger;
    },
    
    types: [],
    totals: [],
    parented: [],
    unparented: [],

    _getData: function(types) {
        var me = this;
        me.types = types;
        Deft.Chain.sequence([
            this._getTotals,
            this._getParents
        ], me). then({
             success: function(results) {
                console.log('Totals Succeeded: ',results);
             },
             failure: function(results) {
                console.log('Totals Failed: ',results);
             },
             scope: me
         }).always( function() {
             me._updateChart();
         });
        

    },

    launch: function() {
        var me = this;
        this._fetchPortfolioItemTypes().then({
            success: function(types) {
                //It might make sense to add Defects here, but the numbers might seem
                //a little skewed because some defects are not meant to have a parent.
                types.splice(0,0, {
                    typePath: 'hierarchicalrequirement',
                    name: 'User Story',
                    parentType: types[0]
                });
                var topBox = me.down('#option_box');
                _.each(types, function(type) {
                    topBox.add( {
                        xtype: 'rallycheckboxfield',
                        fieldLabel: type.name,
                        itemId: type.typePath.split('/').pop(),
                        margin: '10 0 5 15',
                        labelAlign: 'right',
                        listeners: {
                            change: function() {
                                me._updateChart();
                            }
                        }
                    });
                });
                
                me._getData(types);

                //debugger;

                /** So the stats we are after are:
                 *  For stories:
                 *          How many do not have Features (or Stories) as parents
                 *          How many do have Features as parents
                 *          How many do have Stories as parents
                 *  For Features
                 *          How many do not have Initiatives as parents
                 *          How many do have Initiatives as parents
                 */
            },
            failure: function() {
                console.log('Failed to fetch portfolioitem types');
                debugger;
            },
            scope: me
        })
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
                value: 14
            },
            {
                name: 'endDate',
                fieldLabel: 'End Date',
                xtype: 'rallydatefield'
            }
        ]
    },

    _loadRecordCount: function(model, filters, id){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        console.log("Starting load: model>>",model, 'filters>>', filters.toString());

        Ext.create('Rally.data.wsapi.Store', {
            model: model,
            filters: filters,
            limit: 1,
            pageSize: 1
        }).load({
            callback : function(records, operation, successful) {
                var result = {};
                if (successful){
                    console.log('result:', operation);
                    result[id] = operation.resultSet.totalRecords || 0;
                    deferred.resolve(result);
                } else {
                    console.log("Failed: ", operation);
                    result[id] = 0;
                    deferred.resolve(result);
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
                        portfolioItemTypes[idx] = { typePath: d.get('TypePath').toLowerCase(), name: d.get('Name') };
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
