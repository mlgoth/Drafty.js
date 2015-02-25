
COMPRESSOR = java -jar /usr/local/src/yuicompressor-2.4.7/build/yuicompressor-2.4.7.jar --charset ISO-8859-15

# Run make to push and pull from Github
all:	github

github:
	. sinit.sh			# setup ssh key login to github
	-git commit *
	-git push -u origin master
	git pull git@github.com:mlgoth/Drafty.js.git

minify:		mini-drafty.js

mini-drafty.js:	drafty.js
	$(COMPRESSOR) drafty.js -o $@
