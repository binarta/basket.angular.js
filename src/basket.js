angular.module('basket', ['ngRoute', 'ui.bootstrap.modal'])
    .factory('basket', ['config', 'localStorage', 'topicMessageDispatcher', 'restServiceHandler', 'validateOrder', LocalStorageBasketFactory])
    .factory('addToBasketPresenter', [AddToBasketPresenterFactory])
    .factory('updateBasketPresenter', [UpdateBasketPresenterFactory])
    .controller('AddToBasketController', ['$scope', 'basket', 'addToBasketPresenter', AddToBasketController])
    .controller('ViewBasketController', ['$scope', 'basket', 'topicRegistry', '$location', 'validateOrder', 'updateBasketPresenter', 'ngRegisterTopicHandler', ViewBasketController])
    .controller('PlacePurchaseOrderController', ['$scope', '$routeParams', 'config', 'basket', 'usecaseAdapterFactory', 'restServiceHandler', '$location', 'addressSelection', 'localStorage', '$window', PlacePurchaseOrderController])
    .controller('AddToBasketModal', ['$scope', '$modal', AddToBasketModal])
    .controller('RedirectToApprovalUrlController', ['$scope', '$window', '$location', RedirectToApprovalUrlController])
    .config(['$routeProvider', function ($routeProvider) {
        $routeProvider
            .when('/:locale/checkout', {templateUrl: 'partials/shop/checkout.html'})
            .when('/payment-approval', {templateUrl: 'partials/shop/approval.html', controller: 'RedirectToApprovalUrlController'})
            .when('/:locale/payment-approval', {templateUrl: 'partials/shop/approval.html', controller: 'RedirectToApprovalUrlController'});
    }]);

function LocalStorageBasketFactory(config, localStorage, topicMessageDispatcher, restServiceHandler, validateOrder) {
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

    function findItemById(id) {
        return basket.reduce(function (p, c) {
            return p || (c.id == id ? c : null)
        }, null)
    }

    function increment(it) {
        findItemById(it.id).quantity += it.quantity;
    }

    function decrement(it) {
        findItemById(it.id).quantity -= it.quantity;
    }

    function append(it) {
        basket.push({id:it.id, price:it.price, quantity:it.quantity});
    }

    function raiseRefreshNotification() {
        topicMessageDispatcher.fire('basket.refresh', 'ok');
    }

    function isQuantified(it) {
        return it.quantity > 0;
    }

    function removeItem(toRemove) {
        var idx = basket.reduce(function(p,c,i) {
            return c.id == toRemove.id ? i : p;
        }, -1);
        basket.splice(idx, 1);
    }

    return new function () {
        if (isUninitialized()) initialize();
        rehydrate();
        function onError(scope, it, cb, success) {
            if (violationOnScopeFor(scope, it.item.id)) {
                cb();
                if (it.error) it.error(violationOnScopeFor(scope, it.item.id));
            } else success();
        }
        function violationOnScopeFor(scope, id) {
            return scope.violations.items[id];
        }
        function validate(scope, success, error) {
            validateOrder(scope, {
                data:{items:basket},
                success: success,
                error:error
            })
        }
        function onSuccess(it, topic) {
            flush();
            raiseRefreshNotification();
            if (topic) topicMessageDispatcher.fire(topic, 'ok');
            if (it.success) it.success();
        }

        this.refresh = function() {
            rehydrate();
        };
        this.add = function (it) {
            var scope = {};
            var success = function() {
                onSuccess(it, 'basket.item.added');
            };

            var error = function() {
                onError(scope, it, revertAdd, success);
            };

            if (isQuantified(it.item)) {
                contains(it.item) ? increment(it.item) : append(it.item);
                validate(scope, success, error);
            }

            function revertAdd() {
                var item = findItemById(it.item.id);
                if (item && item.quantity - it.item.quantity > 0) decrement(it.item);
                else removeItem(it.item);
            }
        };
        this.update = function (it) {
            var scope = {};
            var success = function() {
                onSuccess(it);
            };
            var error = function() {
                onError(scope, it, rehydrate, success);
            };
            if (isQuantified(it.item)) {
                findItemById(it.item.id).quantity = it.item.quantity + 0;
                validate(scope, success, error);
            }
        };
        this.remove = function (toRemove) {
            removeItem(toRemove);
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
        this.render = function (presenter) {
            restServiceHandler({
                params: {
                    method: 'POST',
                    url: (config.baseUri || '') + 'api/echo/purchase-order',
                    withCredentials: true,
                    data: {
                        namespace: config.namespace,
                        items: this.items().map(function (it) {
                            return {id: it.id, quantity: it.quantity}
                        })
                    }
                },
                success: function(payload) {
                    basket = payload.items;
                    flush();
                    presenter(payload);
                    topicMessageDispatcher.fire('basket.rendered', 'ok');
                }
            });
            presenter({
                items: this.items(),
                subTotal: this.subTotal()
            });
        };
        this.clear = function () {
            initialize();
            raiseRefreshNotification();
        }
    };
}

function ViewBasketController($scope, basket, topicRegistry, $location, validateOrder, updateBasketPresenter, ngRegisterTopicHandler) {
    var config = {};

    $scope.init = function(args) {
        config.validateOrder = args.validateOrder;
    };

    $scope.update = function (it) {
        basket.update({
            item:it,
            success:function() {
                $scope.violations = {};
                if (updateBasketPresenter.success) updateBasketPresenter.success({$scope:$scope});
            },
            error: function(violation) {
                function init() {
                    if (!$scope.violations) $scope.violations = {};
                    if (!$scope.violations.items) $scope.violations.items = {};
                    if (!$scope.errorClassFor) $scope.errorClassFor = {};
                    if (!$scope.errorClassFor[it.id]) $scope.errorClassFor[it.id] = {};
                    if (!$scope.violations[it.id]) $scope.violations.items[it.id] = {};
                }

                init();
                Object.keys(violation).forEach(function(field) {
                    $scope.errorClassFor[it.id][field] = 'error';
                    $scope.violations.items[it.id][field] = violation[field].reduce(function(p,c) {
                        p[c.label] = c.params;
                        return p;
                    }, {});
                });
                if (updateBasketPresenter.error) updateBasketPresenter.error({$scope:$scope, item:it});
            }
        });
    };

    $scope.remove = function (it) {
        basket.remove(it);
    };

    $scope.clear = function () {
        basket.clear();
    };

    $scope.continue = function (path) {
        if ($location.search().redirectTo) {
            $location.path(($scope.locale ? $scope.locale : '') + $location.search().redirectTo);
            $location.search('redirectTo', null);
        } else if (path) {
            $location.path(($scope.locale ? $scope.locale : '') + path);
        } else {
            $location.path('/');
        }
    };

    ngRegisterTopicHandler({
        executeHandlerOnce:true,
        scope:$scope,
        topic:'basket.rendered',
        handler:function() {
            if (config.validateOrder) {
                validateOrder($scope, {
                    data: {
                        items: basket.items()
                    },
                    error: function() {
                        var violations = $scope.violations;

                        $scope.violations = {items:{}};
                        Object.keys(violations.items).forEach(function(id) {
                            $scope.violations.items[id] = {};
                            Object.keys(violations.items[id]).forEach(function(field) {
                                $scope.violations.items[id][field] = violations.items[id][field].reduce(function(p,c) {
                                    p[c.label] = c.params;
                                    return p;
                                }, {})
                            });
                        });
                    }
                });
            }
        }
    });

    ['app.start', 'basket.refresh'].forEach(function (it) {
        topicRegistry.subscribe(it, function () {
            basket.render(function (it) {
                $scope.items = it.items;
                $scope.additionalCharges = it.additionalCharges;
                $scope.subTotal = it.price;
            });
        });
    });
}

function UpdateBasketPresenterFactory() {
    return {}
}

function AddToBasketController($scope, basket, addToBasketPresenter) {
    $scope.quantity = 1;

    $scope.init = function (quantity) {
        $scope.quantity = quantity;
    };

    $scope.submit = function(id, price) {
        basket.add({
            item: {id: id, price: price, quantity: $scope.quantity},
            success: function() {
                if (addToBasketPresenter.success) addToBasketPresenter.success({$scope:$scope});
            },
            error: function(violation) {
                $scope.violations = {};
                $scope.errorClassFor = {};
                Object.keys(violation).forEach(function(field) {
                    $scope.errorClassFor[field] = 'error';
                    $scope.violations[field] = violation[field].reduce(function(p,c) {
                        p[c.label] = c.params;
                        return p;
                    }, {});
                });
                if (addToBasketPresenter.error) addToBasketPresenter.error({$scope:$scope, violations:violation, id:id});
            }
        })
    };
}

function AddToBasketPresenterFactory() {
    return {}
}

function PlacePurchaseOrderController($scope, $routeParams, config, basket, usecaseAdapterFactory, restServiceHandler, $location, addressSelection, localStorage, $window) {
    $scope.submit = function () {
        var ctx = usecaseAdapterFactory($scope);

        var billing = addressSelection.view('billing');
        var shipping = addressSelection.view('shipping');
        ctx.params = {
            method: 'PUT',
            url: config.baseUri + 'api/entity/purchase-order',
            withCredentials: true,
            headers: {
                'Accept-Language': $routeParams.locale
            },
            data: {
                termsAndConditions: $scope.termsAndConditions,
                provider: localStorage.provider,
                comment: $scope.comment,
                items: basket.items().map(function (it) {
                    return {id: it.id, quantity: it.quantity}
                }),
                billing: {
                    label: billing.label || '',
                    addressee: billing.addressee || ''
                },
                shipping: {
                    label: shipping.label || '',
                    addressee: shipping.addressee || ''
                },
                reportType: 'complex'
            }
        };
        ctx.success = function (payload) {
            if (payload.approvalUrl) {
                $location.search('url', payload.approvalUrl);
                $location.path(($scope.locale || '') + '/payment-approval');
            } else $location.path(($scope.locale || '') + '/order-confirmation');
            basket.clear();
            addressSelection.clear();
        };
        restServiceHandler(ctx);
    }
}

function AddToBasketModal($scope, $modal) {
    $scope.submit = function (it) {
        $scope.item = it;
        $modal.open({
            templateUrl: 'partials/basket/add.html',
            backdrop: 'static',
            scope: $scope
        });
    }
}

function RedirectToApprovalUrlController($scope, $window, $location) {
    $scope.init = function () {
        $window.location = $location.search().url;
    }
}
