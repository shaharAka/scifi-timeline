/* ============================================================ go */
/* Must stay last: function declarations hoist, var initialisers do not, so
   everything above has to have run before boot() reads any state. */
var embedded = readEmbedded();
if(embedded) boot(embedded);

})();
