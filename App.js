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

    _getParents: function(date) {
        var parents = Ext.create('Deft.Deferred');
        var promises = [];
        _.each(this.types, function(type) {
            promises.push( function(){
                var deferred = Ext.create('Deft.Deferred');
                var filters = null;
                if (type.typePath === 'HierarchicalRequirement') {
                    //With userstories, you can ask for the field which is the name of the first level portfolio item and 
                    //this field is cascaded down the userstory child hierarchy. So rather than asking for Parent or PortfolioItem,
                    //we ask for 'Feature' (or whatever it is called), we can ignore the parent-child userstory tree.
                    filters = { property: type.parentType.name, operator: '>', value: 0 };
                }
                else {
                    filters = { property: 'Parent', operator: '>', value: 0 };
                }

                this._loadRecordCount(type.typePath, Ext.clone(filters), type.name, date).then({
                    success: function(result) {
//                        me.parented.push(result);
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
                var pointParents = {};
                _.each(results, function(result) {
                    pointParents = Ext.merge(pointParents,result);
                });
                parents.resolve(pointParents);
            },
            failure: function(results) {
                console.log('GetTotals Failed: ', results);
                parents.reject(results);
            }
        });
        return parents;

    },

    _getTotals: function(date) {
        var totals = Ext.create('Deft.Deferred');
        var promises = [];
        _.each(this.types, function(type) {
            promises.push( function(){
                var deferred = Ext.create('Deft.Deferred');
                this._loadRecordCount(type.typePath, { property: 'ObjectID', operator: '>', value: 0}, type.name, date).then({
                    success: function(result) {
//                        me.totals.push(result);
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
                var pointTotals = {};
                _.each(results, function(result) {
                    pointTotals = Ext.merge(pointTotals,result);
                });
                totals.resolve(pointTotals);
            },
            failure: function(results) {
                console.log('GetTotals Failed: ', results);
                totals.reject(results);
            }
        });
        return totals;
    },

    _processResults: function(results) {
        var me = this;
        //Get the keys from the first bit of data. We assume they are going to be consisten throughout the whole set.
        var keys = Object.keys(results[0].point[0]);
        _.each(results, function(result) {
            _.each(keys, function(key) {
                var p = _.find(me.series, function(series) {
                    return series.name === key;
                });
                p.data.push((result.point[1][key] / ((result.point[0][key]>0)?result.point[0][key]:1)) *100);
            });
        });
    },

    _updateChart: function() {
        var me = this;
        var chart = this.down('#trendChart');

        //Get all the enable buttons in the top option box and hide those turned off
        var topBox = this.down('#option_box');

        _.each(me.types, function(type) {
             var checkBox = topBox.down('#'+type.name.replace(/\s+/g, ''));
            if (checkBox ) {
                var series = _.find( chart.getChart().series, function(series) {
                    return series.name === type.name;
                });
                if (checkBox.getValue()) {
                    series.show();
                } else {
                    series.hide();
                }
            }
        });
    },

    _drawChart: function(results) {
        this._processResults(results);
        if (this.down('#trendChart')) { this.down('trendChart').destroy();}

        this.add( {
            xtype: 'rallychart',
            itemId: 'trendChart',
            height: this.getHeight() - this.down('#option_box').getHeight(),
            chartData: {
                categories: this.categories,
                series: this.series
            },
            chartConfig: {
                
                chart: {
                    type: 'line'
                },
                title: {
                    text: 'Percent Correct Parentage'
                },
                xAxis: {
                    type: 'datetime',
                    reversed: true,
                    dateTimeLabelFormats: 
                    {
                        day: "%e-%b-%y",
                        month: "%b-%y"
                    }                
                },
                yAxis: {
                    min: 0,
                    max: 100,
                    title: {
                        text: 'Percentage'
                    }
                },
                tooltip: {
                    headerFormat: '<span style="font-size:10px">{point.key}</span><table>',
                        pointFormat: '<tr><td style="color:{series.color};padding:0">{series.name}: </td>' +
                        '<td style="padding:0"><b>{point.y:.1f} </b></td></tr>',
                        footerFormat: '</table>',
                        shared: true,
                        useHTML: true
                },
                plotOptions: {
                    column: {
                        pointPadding: 0.2,
                            borderWidth: 0
                    }
                }
            }
        });
    },
    
    types: [],

    categories: [],
    series: [],

    _getData: function(loopDate) {
        var deferred = Ext.create('Deft.Deferred');
        var me = this;

        var sequence = [];
        sequence.push(this._getTotals(loopDate));
        sequence.push(this._getParents(loopDate));
        console.log(sequence);
        Deft.Promise.all(sequence). then({
            success: function(results) {
                deferred.resolve({
                    date: loopDate,
                    point: results
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
                types.pop();
                //It might make sense to add Defects here, but the numbers might seem
                //a little skewed because some defects are not meant to have a parent.
                types.splice(0,0, {
                    typePath: 'HierarchicalRequirement',
                    name: 'User Story',
                    parentType: types[0]
                });
                me.types = types;
                var topBox = me.down('#option_box');
                _.each(types, function(type) {
                    topBox.add( {
                        xtype: 'rallycheckboxfield',
                        fieldLabel: type.name,
                        itemId: type.name.replace(/\s+/g,''),
                        margin: '10 0 5 15',
                        labelAlign: 'right',
                        value: true,
                        listeners: {
                            change: function() {
                                me._updateChart();
                            }
                        },
                        scope: me
                    });
                });
                
                _.each(types, function(type) {
                    me.series.push( {
                        name : type.name,
                        data: []
                    });
                });
        
                var pCount = this.getSetting('periodCount') || this.config.defaultSettings.periodCount;
                var pSize = 0;  //Going to default to monthly if zero
                switch( this.getSetting('periodName')) {
                    case 'Day':
                        pSize = 1; break;
                    case 'Week':
                        pSize = 7; break;
                    case 'Fortnight':
                        pSize = 14; break;
                    default:
                        break;
                }
                var pDuration = pSize ? (Ext.Date.DAY) : (Ext.Date.MONTH);
                var date = new Date(this.getSetting('endDate') || Ext.Date.now());
                var dateFormat = pSize ? 'j/M/y' : 'M, y';
                var loopFunctions = [];
                var dates = [];
                for (var i = 0; i < pCount; i++) {
                    dates.push(Ext.Date.subtract(date, pDuration, pSize?(pSize*i):1));
                }

                dates.every( function(item) {
                    me.categories.push(Ext.Date.format(item,dateFormat));
                    loopFunctions.push(function() { 
                        me.setLoading('Fetching data for: ' + Ext.Date.format(item, dateFormat));
                        return me._getData(item); });
                    return true;
                });
                
                Deft.Chain.sequence(loopFunctions).then ({
                    success: function(results){
                        me._drawChart(results);
                    },
                    failure: function(result) {
                        console.log('Failed to execute series loop: ', result);
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

    _loadRecordCount: function(model, filters, id, date){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        console.log("Starting load: ",date, " >> ",model, 'filters >> ', JSON.stringify(filters));

        var localFilters = [
            {
                property: '_TypeHierarchy',
                operator: 'in',
                value: [model]
            },
            {
                property: '__At',
                value: Ext.Date.format(date, "Y-m-d\\TH:i:s")
            },
            {
                property: '_ProjectHierarchy',
                value: me.getContext().getProject().ObjectID
            }
        ];
        localFilters = localFilters.concat(filters);
        Ext.create('Rally.data.lookback.SnapshotStore', {
            filters: localFilters,
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
