
Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    stateful: true,
    stateId: 'NiksApps_LBAPI_Parentage'+Ext.id(),
    config: {
        defaultSettings: {
            atDate: Ext.Date.format(new Date(), "Y-m-d"),
            dateDuration: 0
        }

    },
    items: [
        {
            xtype: 'container',
            itemId: 'option_box',
            layout: 'hbox'
        }
    ],

    _haveParent: function(child) {
        var fieldName = (child.type.typePath === 'HierarchicalRequirement') ? this.types[1].name : "Parent";
        return (child.record.get(fieldName) > 0)? _.find(this.nodes, function(parent) {
            return parent.record.get('ObjectID') === child.record.get(fieldName);}):null;
    },

    _findDepth: function(node) {
        var depth = -1;
        var item = node;
        do {
            item = this._haveParent(item);
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
            height: 120,
            width: 800
        });

        this.add({
            xtype: 'component',
            width: 800,
            align: 'center',
            html: '<p>' + 'Sample Date:   ' + Ext.Date.format(this.date, 'j M Y') + '</p>'
        });

        var dateDuration = this.getSetting('dateDuration');
        if (dateDuration>0){
            this.add({
                xtype: 'component',
                width: 800,
                align: 'center',
                html: '<p>' + 'Artefacts created between ' +   Ext.Date.format(Ext.Date.subtract(this.date,Ext.Date.MONTH, dateDuration), 'j M Y') + ' and ' + Ext.Date.format(this.date, 'j M Y') + '</p>'
            }); 
        }

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
    
        var dateDuration = me.getSetting('dateDuration');
        if (dateDuration >0){
            localFilters.push( {
                property: 'CreationDate',
                operator: '>',
                value: Ext.Date.format(Ext.Date.subtract(date,Ext.Date.MONTH, dateDuration), "Y-m-d\\TH:i:s")
            });
            localFilters.push( {
                property: 'CreationDate',
                operator: '<',
                value: Ext.Date.format(date, "Y-m-d\\TH:i:s")
            });
        }
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

    _getOneLevelItems: function(type, filters) {
        var deferred = Ext.create('Deft.Deferred');
        this._loadRecordTypeSnapshots(type, filters, this.date).then({
            success: function(results) {
                deferred.resolve(results);
            }
        });
        return deferred.promise;
    },

    _Items: [],

    _getNumbersForType: function(type) {
        var deferred = Ext.create('Deft.Deferred');
        this._getOneLevelItems(type,[]).then({
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

        me.setLoading("Fetching portfolio item types");
        this._fetchPortfolioItemTypes().then({
            success: function(types) {
                me.setLoading("Fetching data for: " + Ext.Date.format(me.date, 'Y/m/d'));

                //It might make sense to add Defects here, but the numbers might seem
                //a little skewed because some defects are not meant to have a parent.
                types.splice(0,0, {
                    typePath: 'HierarchicalRequirement',
                    name: 'User Story',
                    parentType: types[0]
                });
                me.types = types;
                    
                var loopFunctions = [];

                _.each(types, function(type) {
                    loopFunctions.push(function() { 
                        me.setLoading( "Fetching all of type: " + type.name);
                        return me._getNumbersForType(type);});
                });

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

    getSettingsFields: function() {
    
        return [
            {
                name: 'atDate',
                fieldLabel: 'Use data as of:',
                labelWidth: 150,
                xtype: 'rallydatefield',
                allowBlank: true,
                blankText: "Use todays date",
            },
            {
                name: 'dateDuration',
                labelWidth: 150,
                fieldLabel: 'Creation Period (months prior)',
                xtype: 'rallynumberfield',
                margin: '0 0 150 0', //Need this 150 or else the date popup is obscured by the bottom of the settings panel.
                value: 0
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
