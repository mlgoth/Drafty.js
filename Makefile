# Drafty.js Makefile to handle github administratrivia and JavaScript minification, 03-Feb-2015/shj

COMPRESSOR = yui-compressor --charset ISO-8859-15
#karma#COMPRESSOR = java -jar /usr/local/src/yuicompressor-2.4.7/build/yuicompressor-2.4.7.jar --charset ISO-8859-15

# Run make to push and pull from Github
all:	github

github:
	-git commit
	-git push -u origin master
	git pull git@github.com:mlgoth/Drafty.js.git
	git push -u origin master

minify:		mini-drafty.js

mini-drafty.js:	drafty.js
	$(COMPRESSOR) drafty.js -o $@
