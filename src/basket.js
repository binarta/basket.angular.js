angular.module('basket', [])
    .factory('basket', ['localStorage', 'topicMessageDispatcher', LocalStorageBasketFactory])
    .controller('AddToBasketController', ['$scope', 'basket', AddToBasketController])
    .controller('ViewBasketController', ['$scope', 'basket', 'topicRegistry', ViewBasketController])
    .controller('PlacePurchaseOrderController', ['$scope', '$routeParams', 'config', 'basket', 'usecaseAdapterFactory', 'restServiceHandler', PlacePurchaseOrderController])
    .config(['$routeProvider', function ($routeProvider) {
        $routeProvider
            .when('/:locale/checkout', {templateUrl: 'partials/shop/checkout.html'});
    }]);

function LocalStorageBasketFactory(localStorage, topicMessageDispatcher) {
    var basket;

    function isUninitialized() {
        return !localStorage.basket;
    }

    function initialize() {
        basket = [];
        flush();
    }

    function flush() {
        localStorage.basket = JSON.stringify(basket);
    }

    function rehydrate() {
        basket = JSON.parse(localStorage.basket);
    }

    function contains(it) {
        return basket.reduce(function (p, c) {
            return p || c.id == it.id;
        }, false)
    }

    function increment(it) {
        basket.reduce(function (p, c) {
            return p || (c.id == it.id ? c : null)
        }, null).quantity += it.quantity;
    }

    function append(it) {
        basket.push(it);
    }

    function raiseRefreshNotification() {
        topicMessageDispatcher.fire('basket.refresh', 'ok');
    }

    return new function () {
        if (isUninitialized()) initialize();
        rehydrate();
        this.add = function (it) {
            contains(it) ? increment(it) : append(it);
            flush();
            raiseRefreshNotification();
        };
        this.items = function () {
            return basket;
        };
        this.subTotal = function () {
            var calculate = function () {
                return basket.reduce(function (sum, it) {
                    return sum + (it.price * it.quantity)
                }, 0);
            };
            return basket ? calculate() : 0;
        };
        this.clear = function () {
            initialize();
            raiseRefreshNotification();
        }
    };
}

function ViewBasketController($scope, basket, topicRegistry) {
    ['app.start', 'basket.refresh'].forEach(function (it) {
        topicRegistry.subscribe(it, function () {
            $scope.items = basket.items();
            $scope.subTotal = basket.subTotal();
        });
    });

    $scope.clear = function () {
        basket.clear();
    }
}

function AddToBasketController($scope, basket) {
    $scope.submit = function (id, price) {
        basket.add({id: id, price: price, quantity: 1});
    }
}

function PlacePurchaseOrderController($scope, $routeParams, config, basket, usecaseAdapterFactory, restServiceHandler) {
    $scope.submit = function () {
        var ctx = usecaseAdapterFactory($scope);
        ctx.params = {
            method: 'PUT',
            url: config.baseUri + 'api/entity/purchase-order',
            withCredentials: true,
            headers:{
                'Accept-Language':$routeParams.locale
            },
            data:{
                items:basket.items().map(function(it) {
                    return {id:it.id, quantity:it.quantity}
                })
            }
        };
        ctx.success = function() {
            basket.clear();
        };
        restServiceHandler(ctx);
    }
}