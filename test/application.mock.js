angular.module('application', [])
    .service('applicationDataService', ['$rootScope', '$q', function($scope, $q) {
        var d = $q.defer();

        this.then = function(listener) {
            d.promise.then(listener);
        };
        this.resolve = function(args) {
            d.resolve(args);
            $scope.$digest();
        }
    }]);