angular.module('$strap.directives', [])
    .factory('modal', function() {
        return {};
    })
    .factory('$modal', ['modal', ModalFactory]);

function ModalFactory(modal) {
    return function(settings) {
        modal.settings = settings;
    }
}