
COMPRESSOR = java -jar /usr/local/src/yuicompressor-2.4.7/build/yuicompressor-2.4.7.jar --charset ISO-8859-15

# Run make to push and pull from Github
all:	mini-drafty.js github

github:
	-git commit *
	-git push -u origin master
	git pull git@github.com:mlgoth/Drafty.js.git

mini-drafty.js:	drafty.js
	$(COMPRESSOR) drafty.js -o $@
